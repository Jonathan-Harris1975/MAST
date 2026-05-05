import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { jobs, LOCAL_TIME_ZONE, SERVICE_NAME, USER_AGENT } from "./jobs.js";

const DEFAULT_STATE = {
  version: 1,
  startedAt: null,
  lastTickAt: null,
  lastRunKeys: {},
  intervalLastRunAt: {},
  recentResults: [],
};

export function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function booleanEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  return ["1", "true", "yes", "y", "on"].includes(String(raw).trim().toLowerCase());
}

export const CONFIG = {
  requestTimeoutMs: numberEnv("REQUEST_TIMEOUT_MS", 60_000),
  requestRetries: numberEnv("REQUEST_RETRIES", 2),
  requestRetryBaseMs: numberEnv("REQUEST_RETRY_BASE_MS", 2_500),
  betweenJobsMs: numberEnv("BETWEEN_JOBS_MS", 1_500),
  stateFile: process.env.STATE_FILE || "/tmp/koyeb-cron-control-state.json",
  recentResultLimit: numberEnv("RECENT_RESULT_LIMIT", 80),
};

let state = { ...DEFAULT_STATE, startedAt: new Date().toISOString() };
let loaded = false;
const runningJobs = new Set();

export function localParts(at, timezone = LOCAL_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    timezone,
    weekday: String(parts.weekday || "").toLowerCase(),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfMonth: Number(parts.day),
    month: Number(parts.month),
    time: `${parts.hour}:${parts.minute}`,
  };
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function redactUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 10
      ? `${parsed.pathname.slice(0, 10)}…${parsed.pathname.slice(-4)}`
      : parsed.pathname;
    return `${parsed.origin}${path}`;
  } catch {
    return "<invalid-url>";
  }
}

export function buildRunKey(job, at) {
  const schedule = job.schedule || {};
  if (schedule.type === "interval") {
    const everyMs = Number(schedule.everyMinutes) * 60_000;
    return `${job.id}:${Math.floor(at.getTime() / everyMs)}`;
  }

  const parts = localParts(at, schedule.timezone || LOCAL_TIME_ZONE);
  return `${job.id}:${parts.timezone}:${parts.date}:${parts.time}`;
}

export function isTimedJobDue(job, at = new Date()) {
  const schedule = job.schedule || {};
  if (!schedule || schedule.type === "interval") return false;

  const parts = localParts(at, schedule.timezone || LOCAL_TIME_ZONE);

  if (schedule.type === "weekly") {
    return Array.isArray(schedule.days)
      && schedule.days.includes(parts.weekday)
      && parts.time === schedule.time;
  }

  if (schedule.type === "monthly") {
    return parts.dayOfMonth === Number(schedule.dayOfMonth)
      && parts.time === schedule.time;
  }

  return false;
}

export function isIntervalJobDue(job, at = new Date(), currentState = state) {
  const schedule = job.schedule || {};
  if (schedule.type !== "interval") return false;

  const everyMs = Number(schedule.everyMinutes) * 60_000;
  if (!Number.isFinite(everyMs) || everyMs <= 0) return false;

  const lastRunAt = currentState.intervalLastRunAt?.[job.id];
  if (!lastRunAt) return true;

  const last = Date.parse(lastRunAt);
  return !Number.isFinite(last) || at.getTime() - last >= everyMs;
}

export function dueJobsAt(at = new Date(), currentState = state) {
  return jobs.filter((job) => {
    if (job.schedule?.type === "interval") {
      return isIntervalJobDue(job, at, currentState);
    }

    if (!isTimedJobDue(job, at)) return false;

    const runKey = buildRunKey(job, at);
    return currentState.lastRunKeys?.[job.id] !== runKey;
  });
}

export function buildPayload(job, at = new Date()) {
  if (job.method !== "POST") return undefined;

  const body = job.body && typeof job.body === "object" && !Array.isArray(job.body)
    ? cloneJson(job.body)
    : {};

  if (job.addLocalDateAsWeekStartDate) {
    body.weekStartDate = localParts(at, job.schedule?.timezone || LOCAL_TIME_ZONE).date;
  }

  return body;
}

export function publicJob(job, at = new Date()) {
  return {
    id: job.id,
    group: job.group,
    description: job.description,
    method: job.method,
    schedule: job.schedule,
    targetPath: job.targetPath,
    targetUrl: job.targetUrl,
    hookEnv: job.hookEnv,
    configuredUrl: Boolean(job.url),
    urlPreview: redactUrl(job.url),
    bodyTemplate: job.method === "POST" ? buildPayload(job, at) : undefined,
    nextRunAt: nextRunForJob(job, at),
  };
}

export async function loadState() {
  if (loaded) return state;

  try {
    const raw = await readFile(CONFIG.stateFile, "utf8");
    const existing = JSON.parse(raw);
    state = {
      ...DEFAULT_STATE,
      ...existing,
      lastRunKeys: existing.lastRunKeys || {},
      intervalLastRunAt: existing.intervalLastRunAt || {},
      recentResults: Array.isArray(existing.recentResults) ? existing.recentResults : [],
      startedAt: existing.startedAt || new Date().toISOString(),
    };
  } catch {
    state = { ...DEFAULT_STATE, startedAt: new Date().toISOString() };
  }

  loaded = true;
  return state;
}

export async function saveState() {
  await mkdir(dirname(CONFIG.stateFile), { recursive: true });
  await writeFile(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resultSummary(result) {
  return {
    job: result.job,
    group: result.group,
    ok: result.ok,
    status: result.status || null,
    trigger: result.trigger,
    runKey: result.runKey,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    targetPath: result.targetPath,
    errorMessage: result.errorMessage || null,
  };
}

function rememberResult(result) {
  state.recentResults = [resultSummary(result), ...(state.recentResults || [])].slice(0, CONFIG.recentResultLimit);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, options, config) {
  let lastError;

  for (let attempt = 0; attempt <= config.requestRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, config.requestTimeoutMs);
      if (response.ok || attempt === config.requestRetries) return response;
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (attempt === config.requestRetries) throw error;
    }

    await sleep(config.requestRetryBaseMs * Math.max(1, attempt + 1));
  }

  throw lastError || new Error("Request failed before response was created");
}

export async function runJob(job, { at = new Date(), trigger = "scheduled", force = false } = {}) {
  await loadState();

  const startedAt = new Date();
  const runKey = buildRunKey(job, at);

  if (!force && job.schedule?.type !== "interval" && state.lastRunKeys?.[job.id] === runKey) {
    return {
      job: job.id,
      group: job.group,
      ok: true,
      skipped: true,
      reason: "already-ran-for-this-schedule-window",
      runKey,
      trigger,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      targetPath: job.targetPath,
    };
  }

  if (runningJobs.has(job.id)) {
    return {
      job: job.id,
      group: job.group,
      ok: false,
      skipped: true,
      reason: "job-already-running",
      runKey,
      trigger,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      targetPath: job.targetPath,
    };
  }

  runningJobs.add(job.id);

  const payload = buildPayload(job, at);
  const headers = {
    "user-agent": USER_AGENT,
    "x-trigger-worker": SERVICE_NAME,
    "x-trigger-job": job.id,
    "x-trigger-group": job.group,
    "x-trigger-run-key": runKey,
    "x-idempotency-key": runKey,
  };

  const body = payload === undefined ? undefined : JSON.stringify(payload);
  if (body !== undefined) {
    headers["content-type"] = "application/json; charset=utf-8";
  }

  const logBase = {
    service: SERVICE_NAME,
    job: job.id,
    group: job.group,
    trigger,
    method: job.method,
    targetPath: job.targetPath,
    targetUrl: job.targetUrl,
    runKey,
    scheduledFor: at.toISOString(),
    urlPreview: redactUrl(job.url),
  };

  console.log(JSON.stringify({ ...logBase, event: "job-started", payload: payload || null }));

  try {
    const response = await fetchWithRetry(job.url, {
      method: job.method,
      headers,
      body,
      redirect: "follow",
    }, CONFIG);

    const responseText = await response.text();
    const finishedAt = new Date();

    const result = {
      ...logBase,
      event: "job-finished",
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      responsePreview: responseText.slice(0, 700),
      payload: payload || null,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };

    if (response.ok) {
      if (job.schedule?.type === "interval") {
        state.intervalLastRunAt[job.id] = finishedAt.toISOString();
      } else {
        state.lastRunKeys[job.id] = runKey;
      }
    }

    rememberResult(result);
    await saveState();
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    const finishedAt = new Date();
    const result = {
      ...logBase,
      event: "job-failed",
      ok: false,
      errorName: error?.name || "Error",
      errorMessage: error?.message || String(error),
      payload: payload || null,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };

    rememberResult(result);
    await saveState();
    console.log(JSON.stringify(result));
    return result;
  } finally {
    runningJobs.delete(job.id);
  }
}

export async function runDueJobs({ at = new Date(), trigger = "scheduled-tick" } = {}) {
  await loadState();
  state.lastTickAt = new Date().toISOString();

  const due = dueJobsAt(at, state);
  const results = [];

  if (!due.length) {
    await saveState();
    return {
      ok: true,
      trigger,
      tickAt: at.toISOString(),
      ran: 0,
      results,
    };
  }

  console.log(JSON.stringify({
    service: SERVICE_NAME,
    event: "due-jobs-found",
    trigger,
    tickAt: at.toISOString(),
    jobs: due.map((job) => job.id),
  }));

  for (const job of due) {
    const result = await runJob(job, { at, trigger });
    results.push(resultSummary(result));
    if (CONFIG.betweenJobsMs > 0) await sleep(CONFIG.betweenJobsMs);
  }

  return {
    ok: results.every((result) => result.ok || result.skipped),
    trigger,
    tickAt: at.toISOString(),
    ran: results.length,
    results,
  };
}

export function nextRunForJob(job, from = new Date()) {
  const schedule = job.schedule || {};

  if (schedule.type === "interval") {
    const lastRunAt = state.intervalLastRunAt?.[job.id];
    if (!lastRunAt) return "as soon as scheduler starts";
    const nextMs = Date.parse(lastRunAt) + Number(schedule.everyMinutes) * 60_000;
    return Number.isFinite(nextMs) ? new Date(nextMs).toISOString() : "as soon as scheduler starts";
  }

  const cursor = new Date(Math.ceil((from.getTime() + 60_000) / 60_000) * 60_000);
  const horizonMinutes = 70 * 24 * 60;

  for (let i = 0; i < horizonMinutes; i += 1) {
    if (isTimedJobDue(job, cursor)) {
      return cursor.toISOString();
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  return null;
}

export async function getStatus() {
  await loadState();
  const now = new Date();

  return {
    ok: true,
    service: SERVICE_NAME,
    nowUtc: now.toISOString(),
    localNow: localParts(now, LOCAL_TIME_ZONE),
    schedulerEnabled: booleanEnv("SCHEDULER_ENABLED", true),
    config: {
      tickSeconds: numberEnv("SCHEDULER_TICK_SECONDS", 20),
      requestTimeoutMs: CONFIG.requestTimeoutMs,
      requestRetries: CONFIG.requestRetries,
      betweenJobsMs: CONFIG.betweenJobsMs,
      stateFile: CONFIG.stateFile,
    },
    jobCount: jobs.length,
    runningJobs: [...runningJobs],
    state: {
      startedAt: state.startedAt,
      lastTickAt: state.lastTickAt,
      lastRunKeys: state.lastRunKeys,
      intervalLastRunAt: state.intervalLastRunAt,
      recentResults: state.recentResults,
    },
    jobs: jobs.map((job) => publicJob(job, now)),
  };
}

export function findJob(id) {
  return jobs.find((job) => job.id === id);
}
