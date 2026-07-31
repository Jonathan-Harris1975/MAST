import { readFile, writeFile, mkdir } from "node:fs/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { dirname } from "node:path";
import { jobs, LOCAL_TIME_ZONE, SERVICE_NAME, USER_AGENT, koyebServiceUrl } from "./jobs.js";
import { sendOperationalEvent } from "./alerts.js";

// --- Service lifecycle model -------------------------------------------------------
//
// MAST is the durable source of truth for AIMS/RAMS lifecycle intent, because Koyeb
// "pause" fully suspends the instance: once paused, the service cannot respond to any
// probe (self-reported state included), so only the actor that paused it - MAST - can
// distinguish an intentional Standby from a genuine Offline/crash. HIVE consults this
// ledger (via GET /services) instead of guessing from a failed health probe alone.
//
// Valid states: starting | online | busy | standby | offline | maintenance.
export const LIFECYCLE_STATES = ["starting", "online", "busy", "standby", "offline", "maintenance"];
export const MANAGED_SERVICES = ["aims", "rams"];

const DEFAULT_SERVICE_LIFECYCLE = () => ({
  state: "offline",
  since: null,
  reason: "no-data",
  lastAction: null,
  lastActionAt: null,
  lastError: null,
});

const SERVICE_LIFECYCLE_CONFIG = {
  aims: {
    serviceIdEnv: "KOYEB_SERVICE_ID_AIMS",
    healthUrlEnv: "AIMS_HEALTH_URL",
    healthUrlFallback: "https://app.jonathan-harris.online/livez",
  },
  rams: {
    serviceIdEnv: "KOYEB_SERVICE_ID_RAMS",
    healthUrlEnv: "RAMS_HEALTH_URL",
    healthUrlFallback: "https://mod.jonathan-harris.online/livez",
  },
};

const DEFAULT_STATE = {
  version: 2,
  startedAt: null,
  lastTickAt: null,
  lastRunKeys: {},
  intervalLastRunAt: {},
  recentResults: [],
  failureStreaks: {},
  reviewQueue: [],
  operator: { schedulerEnabled: true, maintenanceMode: false, reason: null, updatedAt: null },
  metrics: { ticks: 0, delayedTicks: 0, duplicatePreventions: 0, jobsSucceeded: 0, jobsFailed: 0, lastTickLagMs: 0 },
  services: { aims: DEFAULT_SERVICE_LIFECYCLE(), rams: DEFAULT_SERVICE_LIFECYCLE() },
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

function cleanEnv(name) {
  const value = String(process.env[name] || "").trim();
  return /^\{\{\s*secret\.[^}]+\}\}$/i.test(value) ? "" : value;
}

const requestedStateBackend = String(process.env.MAST_STATE_BACKEND || "auto").trim().toLowerCase();
const r2StateConfig = {
  endpoint: cleanEnv("R2_ENDPOINT_URL") || cleanEnv("R2_ENDPOINT"),
  accessKeyId: cleanEnv("R2_ACCESS_KEY_ID"),
  secretAccessKey: cleanEnv("R2_SECRET_ACCESS_KEY"),
  bucket:
    cleanEnv("R2_BUCKET_META_SYSTEM") ||
    cleanEnv("R2_META_SYSTEM_BUCKET") ||
    cleanEnv("R2_BUCKET_METASYSTEM"),
  key: cleanEnv("MAST_STATE_OBJECT_KEY") || "state/mast/scheduler-state.json",
  operatorKey: cleanEnv("MAST_OPERATOR_CONTROL_OBJECT_KEY") || "state/mast/operator-control.json",
  region: cleanEnv("R2_REGION") || "auto",
};
const r2StateConfigured = Boolean(
  r2StateConfig.endpoint &&
    r2StateConfig.accessKeyId &&
    r2StateConfig.secretAccessKey &&
    r2StateConfig.bucket
);
const resolvedStateBackend = requestedStateBackend === "r2"
  ? "r2"
  : requestedStateBackend === "local"
    ? "local"
    : r2StateConfigured
      ? "r2"
      : "local";
let r2StateClient = null;

export const CONFIG = {
  requestTimeoutMs: numberEnv("REQUEST_TIMEOUT_MS", 60_000),
  requestRetries: numberEnv("REQUEST_RETRIES", 2),
  requestRetryBaseMs: numberEnv("REQUEST_RETRY_BASE_MS", 2_500),
  betweenJobsMs: numberEnv("BETWEEN_JOBS_MS", 1_500),
  stateFile: process.env.STATE_FILE || "/tmp/mast-state.json",
  stateBackend: resolvedStateBackend,
  stateObjectKey: r2StateConfig.key,
  recentResultLimit: numberEnv("RECENT_RESULT_LIMIT", 80),
  operatorControlObjectKey: r2StateConfig.operatorKey,
  failureReviewThreshold: numberEnv("MAST_FAILURE_REVIEW_THRESHOLD", 3),
  reviewQueueLimit: numberEnv("MAST_REVIEW_QUEUE_LIMIT", 50),
  expectedTickSeconds: numberEnv("SCHEDULER_TICK_SECONDS", 20),
  aimsOperationPollIntervalMs: numberEnv("MAST_AIMS_OPERATION_POLL_INTERVAL_MS", 15_000),
  aimsOperationTimeoutMs: numberEnv("MAST_AIMS_OPERATION_TIMEOUT_MS", 8 * 60 * 60 * 1000),
};

function stateClient() {
  if (r2StateClient) return r2StateClient;
  r2StateClient = new S3Client({
    endpoint: r2StateConfig.endpoint,
    region: r2StateConfig.region,
    credentials: {
      accessKeyId: r2StateConfig.accessKeyId,
      secretAccessKey: r2StateConfig.secretAccessKey,
    },
    forcePathStyle: true,
    maxAttempts: numberEnv("R2_MAX_ATTEMPTS", 2),
  });
  return r2StateClient;
}

export function stateBackendStatus() {
  const production = ["production", "prod"].includes(String(process.env.APP_ENV || process.env.NODE_ENV || "").toLowerCase());
  const ephemeralAllowed = booleanEnv("ALLOW_EPHEMERAL_STATE", false);
  const validBackend = ["auto", "r2", "local"].includes(requestedStateBackend);
  const ready = validBackend
    && !(requestedStateBackend === "r2" && !r2StateConfigured)
    && (!production || resolvedStateBackend === "r2" || ephemeralAllowed);
  return {
    ready,
    backend: resolvedStateBackend,
    requestedBackend: requestedStateBackend,
    durable: resolvedStateBackend === "r2",
    r2Configured: r2StateConfigured,
    ephemeralAllowed,
  };
}

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

function sourceJobForPretrigger(job) {
  const sourceId = job?.schedule?.sourceJobId || job?.sourceJobId;
  if (!sourceId) return null;
  return jobs.find((item) => item.id === sourceId && item.id !== job.id) || null;
}

function pretriggerSourceTime(job, at) {
  const offsetMinutes = Number(job?.schedule?.offsetMinutes || job?.pretriggerOffsetMinutes);
  if (!Number.isFinite(offsetMinutes) || offsetMinutes <= 0) return null;
  return new Date(at.getTime() + offsetMinutes * 60_000);
}


function latestSuccessfulSourceResult(job, currentState = state) {
  const sourceJobId = job?.schedule?.sourceJobId || job?.sourceJobId;
  if (!sourceJobId) return null;
  return [...(currentState.recentResults || [])]
    .reverse()
    .find((result) => (result?.job === sourceJobId || result?.jobId === sourceJobId) && result?.ok === true && result?.finishedAt);
}

function posttriggerDueAt(job, currentState = state) {
  const result = latestSuccessfulSourceResult(job, currentState);
  if (!result) return null;
  const delayMinutes = Number(job?.schedule?.delayMinutes || 0);
  if (!Number.isFinite(delayMinutes) || delayMinutes < 0) return null;
  const finishedAt = Date.parse(result.finishedAt);
  if (!Number.isFinite(finishedAt)) return null;
  return new Date(finishedAt + delayMinutes * 60_000);
}

export function buildRunKey(job, at) {
  const schedule = job.schedule || {};
  if (schedule.type === "interval") {
    const everyMs = Number(schedule.everyMinutes) * 60_000;
    return `${job.id}:${Math.floor(at.getTime() / everyMs)}`;
  }

  if (schedule.type === "posttrigger") {
    const result = latestSuccessfulSourceResult(job);
    return `${job.id}:source-${schedule.sourceJobId}:${result?.finishedAt || "pending"}`;
  }

  if (schedule.type === "pretrigger") {
    const sourceJob = sourceJobForPretrigger(job);
    const sourceAt = pretriggerSourceTime(job, at);
    const sourceKey = sourceJob && sourceAt
      ? buildRunKey(sourceJob, sourceAt)
      : `${schedule.sourceJobId || job.sourceJobId || "unknown"}:${at.toISOString()}`;
    return `${job.id}:offset-${schedule.offsetMinutes}:${sourceKey}`;
  }

  const parts = localParts(at, schedule.timezone || LOCAL_TIME_ZONE);
  return `${job.id}:${parts.timezone}:${parts.date}:${parts.time}`;
}

export function isTimedJobDue(job, at = new Date()) {
  const schedule = job.schedule || {};
  if (!schedule || schedule.type === "interval" || schedule.type === "manual") return false;

  if (schedule.type === "posttrigger") {
    const dueAt = posttriggerDueAt(job);
    if (!dueAt) return false;
    return at.getTime() >= dueAt.getTime();
  }

  if (schedule.type === "pretrigger") {
    const sourceJob = sourceJobForPretrigger(job);
    const sourceAt = pretriggerSourceTime(job, at);
    return Boolean(sourceJob && sourceAt && isTimedJobDue(sourceJob, sourceAt));
  }

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
    authRequired: Boolean(job.authEnv),
    authEnv: job.authEnv || null,
    bodyTemplate: job.method === "POST" ? buildPayload(job, at) : undefined,
    nextRunAt: null,
    nextRunNote: "Computed by the scheduler at execution time; omitted from status responses to keep diagnostics bounded.",
    managedPretrigger: Boolean(job.managedPretrigger),
    pretriggerStage: job.pretriggerStage || null,
    pretriggerOffsetMinutes: job.pretriggerOffsetMinutes || null,
    sourceJobId: job.sourceJobId || null,
    sourceTargetPath: job.sourceTargetPath || null,
  };
}

function hydrateState(existing) {
  return {
    ...DEFAULT_STATE,
    ...existing,
    lastRunKeys: existing?.lastRunKeys || {},
    intervalLastRunAt: existing?.intervalLastRunAt || {},
    recentResults: Array.isArray(existing?.recentResults) ? existing.recentResults : [],
    failureStreaks: existing?.failureStreaks || {},
    reviewQueue: Array.isArray(existing?.reviewQueue) ? existing.reviewQueue : [],
    operator: { ...DEFAULT_STATE.operator, ...(existing?.operator || {}) },
    metrics: { ...DEFAULT_STATE.metrics, ...(existing?.metrics || {}) },
    services: {
      aims: { ...DEFAULT_SERVICE_LIFECYCLE(), ...(existing?.services?.aims || {}) },
      rams: { ...DEFAULT_SERVICE_LIFECYCLE(), ...(existing?.services?.rams || {}) },
    },
    startedAt: existing?.startedAt || new Date().toISOString(),
  };
}

async function readR2Json(key) {
  if (!r2StateConfigured) throw new Error("MAST R2 state backend is not fully configured");
  try {
    const response = await stateClient().send(new GetObjectCommand({
      Bucket: r2StateConfig.bucket,
      Key: key,
    }));
    const raw = await response.Body.transformToString();
    return JSON.parse(raw);
  } catch (error) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function readR2State() {
  return readR2Json(r2StateConfig.key);
}

export async function loadOperatorControl() {
  const envEnabled = booleanEnv("SCHEDULER_ENABLED", true);
  const fallback = { schedulerEnabled: envEnabled, maintenanceMode: false, reason: null, updatedAt: null };
  if (CONFIG.stateBackend !== "r2") return fallback;
  const control = await readR2Json(CONFIG.operatorControlObjectKey);
  if (!control || typeof control !== "object" || Array.isArray(control)) return fallback;
  return {
    schedulerEnabled: envEnabled && control.schedulerEnabled !== false,
    maintenanceMode: control.maintenanceMode === true,
    reason: typeof control.reason === "string" ? control.reason.slice(0, 240) : null,
    updatedAt: typeof control.updatedAt === "string" ? control.updatedAt : null,
  };
}

export async function loadState() {
  if (loaded) return state;

  try {
    const existing = CONFIG.stateBackend === "r2"
      ? await readR2State()
      : JSON.parse(await readFile(CONFIG.stateFile, "utf8"));
    state = hydrateState(existing || {});
  } catch (error) {
    if (requestedStateBackend === "r2" && !r2StateConfigured) throw error;
    console.warn(JSON.stringify({ service: SERVICE_NAME, event: "state-load-fallback", backend: CONFIG.stateBackend, errorName: error?.name || "Error" }));
    state = hydrateState({});
  }

  loaded = true;
  return state;
}

export async function saveState() {
  const body = JSON.stringify(state, null, 2);
  if (CONFIG.stateBackend === "r2") {
    if (!r2StateConfigured) throw new Error("MAST R2 state backend is not fully configured");
    await stateClient().send(new PutObjectCommand({
      Bucket: r2StateConfig.bucket,
      Key: r2StateConfig.key,
      Body: body,
      ContentType: "application/json",
      CacheControl: "no-store",
    }));
    return;
  }
  await mkdir(dirname(CONFIG.stateFile), { recursive: true });
  await writeFile(CONFIG.stateFile, body);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Service lifecycle ledger -------------------------------------------------------

export function getServiceLifecycle(serviceKey) {
  const key = String(serviceKey || "").toLowerCase();
  if (!MANAGED_SERVICES.includes(key)) return null;
  return { service: key, ...(state.services?.[key] || DEFAULT_SERVICE_LIFECYCLE()) };
}

export function getAllServiceLifecycles() {
  return Object.fromEntries(MANAGED_SERVICES.map((key) => [key, getServiceLifecycle(key)]));
}

export function setServiceLifecycle(serviceKey, value, { reason = null, lastAction = null, lastError = null } = {}) {
  const key = String(serviceKey || "").toLowerCase();
  if (!MANAGED_SERVICES.includes(key)) throw new Error(`Unknown managed service: ${serviceKey}`);
  if (!LIFECYCLE_STATES.includes(value)) throw new Error(`Invalid lifecycle state: ${value}`);
  state.services = state.services || {};
  const previous = state.services[key] || DEFAULT_SERVICE_LIFECYCLE();
  const changed = previous.state !== value;
  state.services[key] = {
    ...previous,
    state: value,
    since: changed ? new Date().toISOString() : previous.since || new Date().toISOString(),
    reason: reason || previous.reason,
    lastAction: lastAction || previous.lastAction,
    lastActionAt: lastAction ? new Date().toISOString() : previous.lastActionAt,
    lastError: lastError !== null ? lastError : (value === "online" ? null : previous.lastError),
  };
  console.log(JSON.stringify({
    service: SERVICE_NAME, event: "service-lifecycle-transition",
    managedService: key, from: previous.state, to: value, reason: reason || previous.reason,
  }));
  return getServiceLifecycle(key);
}

export function serviceHealthUrl(serviceKey) {
  const config = SERVICE_LIFECYCLE_CONFIG[serviceKey];
  if (!config) return "";
  const configured = String(process.env[config.healthUrlEnv] || "").trim();
  return configured || config.healthUrlFallback;
}

async function pingServiceHealth(serviceKey) {
  const url = serviceHealthUrl(serviceKey);
  if (!url) return { ok: false, reason: "health-url-not-configured" };
  try {
    const response = await fetchWithTimeout(url, { method: "GET", headers: { "user-agent": USER_AGENT } }, CONFIG.requestTimeoutMs);
    return { ok: response.ok, httpStatus: response.status };
  } catch (error) {
    return { ok: false, reason: error?.name || "fetch-error" };
  }
}

// Fire-and-forget background poll after a resume action. Bounded attempts so a
// permanently-broken deployment cannot leave a poll loop running forever; on
// exhaustion the ledger records "offline" with a clear reason so HIVE/MAST/operator
// can retry deliberately rather than silently believing the service is "starting".
async function pollServiceUntilOnline(serviceKey, {
  maxAttempts = numberEnv("SERVICE_RESUME_POLL_MAX_ATTEMPTS", 40),
  intervalMs = numberEnv("SERVICE_RESUME_POLL_INTERVAL_MS", 5_000),
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await sleep(intervalMs);
    await loadState();
    const current = getServiceLifecycle(serviceKey);
    if (!current || current.state !== "starting") return; // superseded (paused again, manual override, etc.)
    const probe = await pingServiceHealth(serviceKey);
    if (probe.ok) {
      setServiceLifecycle(serviceKey, "online", { reason: "resume-poll-succeeded" });
      await saveState();
      return;
    }
  }
  await loadState();
  const stillStarting = getServiceLifecycle(serviceKey);
  if (stillStarting && stillStarting.state === "starting") {
    setServiceLifecycle(serviceKey, "offline", {
      reason: "resume-poll-timed-out",
      lastError: `Service did not become healthy within ${maxAttempts} attempts.`,
    });
    await saveState();
  }
}

export async function requestServiceResume(serviceKey, { reason = "on-demand-request" } = {}) {
  const key = String(serviceKey || "").toLowerCase();
  if (!MANAGED_SERVICES.includes(key)) {
    return { ok: false, error: "unknown-service", service: serviceKey };
  }
  await loadState();
  const current = getServiceLifecycle(key);
  if (["online", "busy", "starting"].includes(current.state)) {
    return { ok: true, service: key, idempotent: true, ...current };
  }

  const config = SERVICE_LIFECYCLE_CONFIG[key];
  const url = koyebServiceUrl(config.serviceIdEnv, "resume");
  const token = envSecret("KOYEB_TOKEN");
  if (!token) {
    return { ok: false, error: "missing-koyeb-token", service: key };
  }

  try {
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "user-agent": USER_AGENT },
    }, CONFIG);
    if (!response.ok) {
      const errorState = setServiceLifecycle(key, "offline", {
        reason: `koyeb-resume-http-${response.status}`,
        lastAction: "resume",
        lastError: `Koyeb resume call returned HTTP ${response.status}.`,
      });
      await saveState();
      return { ok: false, error: `koyeb-resume-http-${response.status}`, ...errorState };
    }
  } catch (error) {
    const errorState = setServiceLifecycle(key, "offline", {
      reason: "koyeb-resume-request-failed",
      lastAction: "resume",
      lastError: error?.message || "Koyeb resume request failed.",
    });
    await saveState();
    return { ok: false, error: "koyeb-resume-request-failed", ...errorState };
  }

  const started = setServiceLifecycle(key, "starting", { reason, lastAction: "resume" });
  await saveState();

  // Do not await: the HTTP caller (HIVE) polls the target's own health endpoint and/or
  // this ledger for progress; this background loop is a resilience backstop that keeps
  // the ledger accurate even if nobody polls.
  pollServiceUntilOnline(key).catch((error) => {
    console.error(JSON.stringify({ service: SERVICE_NAME, event: "service-resume-poll-error", managedService: key, errorName: error?.name || "Error" }));
  });

  return { ok: true, service: key, idempotent: false, ...started };
}

export async function requestServicePause(serviceKey, { reason = "on-demand-request" } = {}) {
  const key = String(serviceKey || "").toLowerCase();
  if (!MANAGED_SERVICES.includes(key)) {
    return { ok: false, error: "unknown-service", service: serviceKey };
  }
  await loadState();
  const current = getServiceLifecycle(key);
  if (current.state === "busy") {
    return { ok: false, error: "service-busy", ...current };
  }
  if (current.state === "standby") {
    return { ok: true, service: key, idempotent: true, ...current };
  }

  const config = SERVICE_LIFECYCLE_CONFIG[key];
  const url = koyebServiceUrl(config.serviceIdEnv, "pause");
  const token = envSecret("KOYEB_TOKEN");
  if (!token) {
    return { ok: false, error: "missing-koyeb-token", service: key };
  }

  try {
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "user-agent": USER_AGENT },
    }, CONFIG);
    if (!response.ok) {
      const errorState = setServiceLifecycle(key, "offline", {
        reason: `koyeb-pause-http-${response.status}`,
        lastAction: "pause",
        lastError: `Koyeb pause call returned HTTP ${response.status}.`,
      });
      await saveState();
      return { ok: false, error: `koyeb-pause-http-${response.status}`, ...errorState };
    }
  } catch (error) {
    const errorState = setServiceLifecycle(key, "offline", {
      reason: "koyeb-pause-request-failed",
      lastAction: "pause",
      lastError: error?.message || "Koyeb pause request failed.",
    });
    await saveState();
    return { ok: false, error: "koyeb-pause-request-failed", ...errorState };
  }

  const paused = setServiceLifecycle(key, "standby", { reason, lastAction: "pause" });
  await saveState();
  return { ok: true, service: key, idempotent: false, ...paused };
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
    managedPretrigger: Boolean(result.managedPretrigger),
    pretriggerStage: result.pretriggerStage || null,
    sourceJobId: result.sourceJobId || null,
    operationStatus: result.operationJob?.status || result.operationFailure?.status || null,
    operationFailures: Number(result.operationJob?.failures ?? result.operationFailure?.failures ?? 0),
  };
}

function rememberResult(result) {
  state.recentResults = [resultSummary(result), ...(state.recentResults || [])].slice(0, CONFIG.recentResultLimit);
  state.metrics = { ...DEFAULT_STATE.metrics, ...(state.metrics || {}) };
  state.failureStreaks = state.failureStreaks || {};
  if (result.ok) {
    state.metrics.jobsSucceeded += 1;
    state.failureStreaks[result.job] = 0;
    return;
  }
  if (result.skipped && result.reason === "already-ran-for-this-schedule-window") {
    state.metrics.duplicatePreventions += 1;
    return;
  }
  if (result.skipped) return;
  state.metrics.jobsFailed += 1;
  const streak = Number(state.failureStreaks[result.job] || 0) + 1;
  state.failureStreaks[result.job] = streak;
  if (streak >= CONFIG.failureReviewThreshold) {
    const review = {
      id: `${result.job}:${result.runKey}`,
      job: result.job,
      group: result.group,
      failureStreak: streak,
      runKey: result.runKey,
      errorMessage: result.errorMessage || `HTTP ${result.status || "failure"}`,
      lastFailedAt: result.finishedAt,
      status: "open",
    };
    state.reviewQueue = [review, ...(state.reviewQueue || []).filter((item) => item.job !== result.job)]
      .slice(0, CONFIG.reviewQueueLimit);
  }
}


function looksLikeSecretPlaceholder(value) {
  return /^\{\{\s*secret\.[^}]+\}\}$/i.test(String(value || "").trim());
}

function envSecret(name) {
  if (!name) return null;
  const value = process.env[name];
  if (!value || !value.trim() || looksLikeSecretPlaceholder(value)) return null;
  return value.trim();
}

export function buildRequestHeaders(job, runKey) {
  const headers = {
    "user-agent": USER_AGENT,
    "x-trigger-worker": SERVICE_NAME,
    "x-trigger-job": job.id,
    "x-trigger-group": job.group,
    "x-trigger-run-key": runKey,
    "x-idempotency-key": runKey,
  };

  if (job.managedPretrigger) {
    headers["x-trigger-pretrigger-stage"] = job.pretriggerStage || "";
    headers["x-trigger-source-job"] = job.sourceJobId || "";
    headers["x-trigger-source-path"] = job.sourceTargetPath || "";
    headers["x-trigger-offset-minutes"] = String(job.pretriggerOffsetMinutes || "");
  }

  if (job.authEnv) {
    const token = envSecret(job.authEnv);
    if (!token) {
      throw new Error(`Missing ${job.authEnv}; cannot authorise job ${job.id}`);
    }
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
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

async function waitForAimsOperation(job, responseText) {
  if (job.group !== "operations") return null;
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error("AIMS operation response was not valid JSON");
  }
  const operation = payload?.job;
  if (!operation?.id) {
    throw new Error("AIMS operation response omitted job.id");
  }
  const statusUrl = new URL(`/ops/jobs/${encodeURIComponent(operation.id)}`, job.url).toString();
  const deadline = Date.now() + CONFIG.aimsOperationTimeoutMs;
  while (Date.now() < deadline) {
    const response = await fetchWithRetry(statusUrl, { method: "GET", headers: buildRequestHeaders(job, `poll:${operation.id}`), redirect: "follow" }, CONFIG);
    const text = await response.text();
    if (!response.ok) throw new Error(`AIMS operation status returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    const statusPayload = JSON.parse(text);
    const current = statusPayload?.job;
    if (!current?.status) throw new Error("AIMS operation status response omitted job.status");
    if (["completed", "completed-with-failures", "failed"].includes(current.status)) return current;
    if (!["accepted", "running"].includes(current.status)) throw new Error(`Unexpected AIMS operation status: ${current.status}`);
    await sleep(CONFIG.aimsOperationPollIntervalMs);
  }
  throw new Error(`AIMS operation ${operation.id} exceeded ${CONFIG.aimsOperationTimeoutMs}ms timeout`);
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

  // A service mid-request should never be paused out from under it: skip this run and
  // let the next scheduled pause (or an operator) retry once it is no longer busy.
  if (job.lifecycle?.action === "pause") {
    const current = getServiceLifecycle(job.lifecycle.service);
    if (current?.state === "busy") {
      return {
        job: job.id,
        group: job.group,
        ok: true,
        skipped: true,
        reason: "service-busy-pause-deferred",
        runKey,
        trigger,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        targetPath: job.targetPath,
      };
    }
  }

  runningJobs.add(job.id);

  const payload = buildPayload(job, at);
  const headers = buildRequestHeaders(job, runKey);

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
    managedPretrigger: Boolean(job.managedPretrigger),
    pretriggerStage: job.pretriggerStage || null,
    pretriggerOffsetMinutes: job.pretriggerOffsetMinutes || null,
    sourceJobId: job.sourceJobId || null,
    sourceTargetPath: job.sourceTargetPath || null,
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
    const operationJob = response.ok ? await waitForAimsOperation(job, responseText) : null;
    const operationOk = !operationJob || (operationJob.status === "completed" && Number(operationJob.failures || 0) === 0);
    const jobOk = response.ok && operationOk;
    const finishedAt = new Date();

    const result = {
      ...logBase,
      event: jobOk ? "job-finished" : "job-failed",
      ok: jobOk,
      status: response.status,
      statusText: response.statusText,
      responsePreview: responseText.slice(0, 700),
      operationJob,
      operationFailure: operationJob && !operationOk ? {
        status: operationJob.status,
        failures: Number(operationJob.failures || 0),
        results: operationJob.results || [],
      } : null,
      payload: payload || null,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };

    if (jobOk) {
      if (job.schedule?.type === "interval") {
        state.intervalLastRunAt[job.id] = finishedAt.toISOString();
      } else {
        state.lastRunKeys[job.id] = runKey;
      }

      if (job.lifecycle?.action === "pause") {
        setServiceLifecycle(job.lifecycle.service, "standby", { reason: `scheduled-pause:${trigger}`, lastAction: "pause" });
      } else if (job.lifecycle?.action === "resume") {
        setServiceLifecycle(job.lifecycle.service, "starting", { reason: `scheduled-resume:${trigger}`, lastAction: "resume" });
      }
    } else if (job.lifecycle) {
      setServiceLifecycle(job.lifecycle.service, "offline", {
        reason: `scheduled-${job.lifecycle.action}-http-${response.status}`,
        lastAction: job.lifecycle.action,
        lastError: `Koyeb ${job.lifecycle.action} call returned HTTP ${response.status}.`,
      });
    }

    rememberResult(result);
    await saveState();
    console.log(JSON.stringify(result));

    if (jobOk && job.lifecycle?.action === "resume") {
      pollServiceUntilOnline(job.lifecycle.service).catch((pollError) => {
        console.error(JSON.stringify({ service: SERVICE_NAME, event: "service-resume-poll-error", managedService: job.lifecycle.service, errorName: pollError?.name || "Error" }));
      });
    }

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

    if (job.lifecycle) {
      setServiceLifecycle(job.lifecycle.service, "offline", {
        reason: `scheduled-${job.lifecycle.action}-request-failed`,
        lastAction: job.lifecycle.action,
        lastError: error?.message || `Koyeb ${job.lifecycle.action} request failed.`,
      });
    }

    rememberResult(result);
    await saveState();
    if (Number(state.failureStreaks?.[job.id] || 0) === CONFIG.failureReviewThreshold) {
      await sendOperationalEvent({
        event_id: `mast:${job.id}:${runKey}:failure-threshold`,
        severity: "critical",
        event_type: "repeated_job_failure",
        title: `MAST job ${job.id} failed repeatedly`,
        summary: `The job reached ${CONFIG.failureReviewThreshold} consecutive failures and was added to the review queue.`,
        release_id: process.env.APP_VERSION || null,
        details: { job: job.id, group: job.group, runKey, failureStreak: CONFIG.failureReviewThreshold },
      });
    }
    console.log(JSON.stringify(result));
    return result;
  } finally {
    runningJobs.delete(job.id);
  }
}

export async function runDueJobs({ at = new Date(), trigger = "scheduled-tick" } = {}) {
  await loadState();
  const previousTick = Date.parse(state.lastTickAt || "");
  const nowMs = Date.now();
  const expectedMs = CONFIG.expectedTickSeconds * 1000;
  const lagMs = Number.isFinite(previousTick) ? Math.max(0, nowMs - previousTick - expectedMs) : 0;
  state.metrics = { ...DEFAULT_STATE.metrics, ...(state.metrics || {}) };
  state.metrics.ticks += 1;
  state.metrics.lastTickLagMs = lagMs;
  if (lagMs > expectedMs) state.metrics.delayedTicks += 1;
  state.lastTickAt = new Date(nowMs).toISOString();
  state.operator = await loadOperatorControl();

  if (!state.operator.schedulerEnabled || state.operator.maintenanceMode) {
    await saveState();
    return {
      ok: true,
      skipped: true,
      reason: state.operator.maintenanceMode ? "maintenance-mode" : "scheduler-paused",
      trigger,
      tickAt: at.toISOString(),
      ran: 0,
      results: [],
    };
  }

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
      stateBackend: CONFIG.stateBackend,
      stateObjectKey: CONFIG.stateBackend === "r2" ? CONFIG.stateObjectKey : null,
      stateFile: CONFIG.stateBackend === "local" ? CONFIG.stateFile : null,
      pretriggerChecksEnabled: booleanEnv("AIMS_PRETRIGGER_CHECKS_ENABLED", true),
    },
    jobCount: jobs.length,
    pretriggerJobCount: jobs.filter((job) => job.managedPretrigger).length,
    runningJobs: [...runningJobs],
    state: {
      startedAt: state.startedAt,
      lastTickAt: state.lastTickAt,
      lastRunKeys: state.lastRunKeys,
      intervalLastRunAt: state.intervalLastRunAt,
      recentResults: state.recentResults,
      failureStreaks: state.failureStreaks,
      reviewQueue: state.reviewQueue,
      operator: state.operator,
      metrics: state.metrics,
    },
    jobs: jobs.map((job) => publicJob(job, now)),
  };
}

export function findJob(id) {
  return jobs.find((job) => job.id === id);
}
