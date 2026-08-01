import crypto from "node:crypto";
import http from "node:http";
import { jobs, SERVICE_NAME } from "./jobs.js";
import {
  booleanEnv,
  findJob,
  getAllServiceLifecycles,
  getServiceLifecycle,
  getStatus,
  loadState,
  MANAGED_SERVICES,
  numberEnv,
  publicJob,
  requestServicePause,
  requestServiceResume,
  runDueJobs,
  runJob,
  stateBackendStatus,
} from "./scheduler.js";

const PORT = Number(process.env.PORT || 8000);
const APP_VERSION = process.env.APP_VERSION || "1.2.3";
const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || "development";
const SCHEDULER_ENABLED = booleanEnv("SCHEDULER_ENABLED", true);
const TICK_SECONDS = numberEnv("SCHEDULER_TICK_SECONDS", 20);
const ADMIN_TOKEN = (process.env.CRON_ADMIN_TOKEN || "").trim();
const ALLOW_PUBLIC_MANUAL_RUNS = booleanEnv("ALLOW_PUBLIC_MANUAL_RUNS", false);
const MAX_BODY_BYTES = numberEnv("MAX_REQUEST_BODY_BYTES", 1_048_576);
const SHUTDOWN_GRACE_MS = numberEnv("SHUTDOWN_GRACE_MS", 10_000);
const STARTED_AT = new Date().toISOString();

let tickInProgress = false;
let lastTickResult = null;
let tickTimer = null;
let shuttingDown = false;


function configuredEnv(name) {
  const value = String(process.env[name] || "").trim();
  return Boolean(value && !/^\{\{\s*secret\.[^}]+\}\}$/i.test(value));
}

function requestId(req) {
  const supplied = String(req.headers["x-request-id"] || "").trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function baseHeaders(id) {
  return {
    "cache-control": "no-store, max-age=0",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": id,
    "x-robots-tag": "noindex, nofollow, noarchive",
  };
}

function jsonResponse(res, statusCode, payload, id) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    ...baseHeaders(id),
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function textResponse(res, statusCode, text, id) {
  res.writeHead(statusCode, {
    ...baseHeaders(id),
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error("Invalid JSON body");
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isAuthorised(req) {
  if (ALLOW_PUBLIC_MANUAL_RUNS) return true;
  if (!ADMIN_TOKEN) return false;
  const auth = String(req.headers.authorization || "");
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerToken = String(req.headers["x-cron-admin-token"] || "").trim();
  return secureEqual(bearer, ADMIN_TOKEN) || secureEqual(headerToken, ADMIN_TOKEN);
}

function readiness() {
  const checks = [
    { name: "state_loaded", ok: true },
    { name: "job_registry", ok: jobs.length > 0, detail: `${jobs.length} jobs registered` },
    { name: "scheduler", ok: SCHEDULER_ENABLED, detail: SCHEDULER_ENABLED ? "enabled" : "disabled" },
    { name: "durable_state", ok: stateBackendStatus().ready, detail: stateBackendStatus().durable ? "R2" : "local/ephemeral" },
    { name: "admin_token", ok: APP_ENV !== "production" || Boolean(ADMIN_TOKEN) || ALLOW_PUBLIC_MANUAL_RUNS, detail: ADMIN_TOKEN ? "configured" : "missing" },
    { name: "aims_token", ok: APP_ENV !== "production" || configuredEnv("AIMS_API_KEY"), detail: configuredEnv("AIMS_API_KEY") ? "configured" : "missing-or-placeholder" },
    { name: "rams_token", ok: APP_ENV !== "production" || configuredEnv("RMS_API_KEY"), detail: configuredEnv("RMS_API_KEY") ? "configured" : "missing-or-placeholder" },
    { name: "koyeb_token", ok: APP_ENV !== "production" || !booleanEnv("KOYEB_POWER_MANAGEMENT_ENABLED", true) || configuredEnv("KOYEB_TOKEN"), detail: configuredEnv("KOYEB_TOKEN") ? "configured" : "missing-or-placeholder" },
    { name: "koyeb_aims_service", ok: APP_ENV !== "production" || !booleanEnv("KOYEB_POWER_MANAGEMENT_ENABLED", true) || configuredEnv("KOYEB_SERVICE_ID_AIMS"), detail: configuredEnv("KOYEB_SERVICE_ID_AIMS") ? "configured" : "missing-or-placeholder" },
    { name: "koyeb_rams_service", ok: APP_ENV !== "production" || !booleanEnv("KOYEB_POWER_MANAGEMENT_ENABLED", true) || configuredEnv("KOYEB_SERVICE_ID_RAMS"), detail: configuredEnv("KOYEB_SERVICE_ID_RAMS") ? "configured" : "missing-or-placeholder" },
  ];
  const ready = !shuttingDown && checks.every((check) => check.ok);
  return { ready, status: ready ? "ready" : "degraded", checks };
}

function protectedRoute(req, res, id) {
  if (isAuthorised(req)) return true;
  jsonResponse(res, ADMIN_TOKEN ? 401 : 503, {
    ok: false,
    status: ADMIN_TOKEN ? "unauthorised" : "not_configured",
    error: ADMIN_TOKEN ? "manual-run-requires-cron-admin-token" : "CRON_ADMIN_TOKEN is not configured",
    requestId: id,
  }, id);
  return false;
}

async function schedulerTick(trigger = "scheduled-tick") {
  if (tickInProgress) {
    console.log(JSON.stringify({ service: SERVICE_NAME, event: "tick-skipped", reason: "previous-tick-still-running" }));
    return { ok: true, skipped: true, reason: "previous-tick-still-running" };
  }
  tickInProgress = true;
  try {
    lastTickResult = await runDueJobs({ trigger });
    return lastTickResult;
  } finally {
    tickInProgress = false;
  }
}

function startScheduler() {
  if (!SCHEDULER_ENABLED) {
    console.log(JSON.stringify({ service: SERVICE_NAME, event: "scheduler-disabled" }));
    return;
  }
  const intervalMs = Math.max(10, TICK_SECONDS) * 1000;
  console.log(JSON.stringify({ service: SERVICE_NAME, event: "scheduler-started", tickSeconds: TICK_SECONDS, jobCount: jobs.length }));
  if (booleanEnv("SCHEDULER_STARTUP_TICK_ENABLED", true)) {
    setTimeout(() => schedulerTick("startup-tick"), 3_000).unref?.();
  }
  tickTimer = setInterval(() => schedulerTick("scheduled-tick"), intervalMs);
  tickTimer.unref?.();
}

async function route(req, res) {
  const id = requestId(req);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/") {
    return jsonResponse(res, 200, { ok: true, service: SERVICE_NAME, version: APP_VERSION, status: "online" }, id);
  }
  if ((req.method === "GET" || req.method === "HEAD") && ["/health", "/livez"].includes(url.pathname)) {
    if (req.method === "HEAD") return jsonResponse(res, 200, {}, id);
    return jsonResponse(res, 200, {
      ok: true,
      status: "healthy",
      service: SERVICE_NAME,
      version: APP_VERSION,
      env: APP_ENV,
      startedAt: STARTED_AT,
      schedulerEnabled: SCHEDULER_ENABLED,
      tickSeconds: TICK_SECONDS,
      jobCount: jobs.length,
      tickInProgress,
      lastTickResult,
      time: new Date().toISOString(),
    }, id);
  }
  if (req.method === "GET" && url.pathname === "/readyz") {
    const report = readiness();
    return jsonResponse(res, report.ready ? 200 : 503, { ok: report.ready, service: SERVICE_NAME, version: APP_VERSION, ...report, time: new Date().toISOString() }, id);
  }
  if (req.method === "GET" && url.pathname === "/jobs") {
    if (!protectedRoute(req, res, id)) return;
    const now = new Date();
    return jsonResponse(res, 200, { ok: true, service: SERVICE_NAME, jobCount: jobs.length, jobs: jobs.map((job) => publicJob(job, now)) }, id);
  }
  if (req.method === "GET" && url.pathname === "/status") {
    const report = readiness();
    return jsonResponse(res, report.ready ? 200 : 503, {
      ok: report.ready,
      status: report.status,
      service: SERVICE_NAME,
      version: APP_VERSION,
      env: APP_ENV,
      schedulerEnabled: SCHEDULER_ENABLED,
      jobCount: jobs.length,
      tickInProgress,
      lastTickAt: lastTickResult?.completedAt || lastTickResult?.time || null,
      lastTickOk: typeof lastTickResult?.ok === "boolean" ? lastTickResult.ok : null,
      readiness: report,
      time: new Date().toISOString(),
    }, id);
  }
  if (req.method === "GET" && url.pathname === "/status/details") {
    if (!protectedRoute(req, res, id)) return;
    const status = await getStatus();
    return jsonResponse(res, 200, { ...status, version: APP_VERSION, env: APP_ENV, readiness: readiness() }, id);
  }
  if (req.method === "POST" && url.pathname === "/tick") {
    if (!protectedRoute(req, res, id)) return;
    const result = await schedulerTick("manual-tick");
    return jsonResponse(res, result.ok ? 200 : 500, result, id);
  }
  if (req.method === "GET" && url.pathname === "/services") {
    await loadState();
    return jsonResponse(res, 200, { ok: true, service: SERVICE_NAME, services: getAllServiceLifecycles(), time: new Date().toISOString() }, id);
  }
  if (req.method === "GET" && url.pathname.startsWith("/services/") && url.pathname.split("/").length === 3) {
    await loadState();
    const serviceKey = decodeURIComponent(url.pathname.replace("/services/", ""));
    const lifecycle = getServiceLifecycle(serviceKey);
    if (!lifecycle) return jsonResponse(res, 404, { ok: false, error: "unknown-service", requestedService: serviceKey, managedServices: MANAGED_SERVICES }, id);
    return jsonResponse(res, 200, { ok: true, service: SERVICE_NAME, ...lifecycle, time: new Date().toISOString() }, id);
  }
  if (req.method === "POST" && /^\/services\/[^/]+\/resume$/.test(url.pathname)) {
    if (!protectedRoute(req, res, id)) return;
    const serviceKey = decodeURIComponent(url.pathname.split("/")[2]);
    let body = {};
    try {
      body = await parseBody(req);
    } catch (error) {
      return jsonResponse(res, Number(error.statusCode || 400), { ok: false, error: error.message, requestId: id }, id);
    }
    const result = await requestServiceResume(serviceKey, { reason: String(body.reason || "hive-on-demand-request") });
    return jsonResponse(res, result.ok ? 202 : (result.error === "unknown-service" ? 404 : 502), { ...result, requestId: id }, id);
  }
  if (req.method === "POST" && /^\/services\/[^/]+\/pause$/.test(url.pathname)) {
    if (!protectedRoute(req, res, id)) return;
    const serviceKey = decodeURIComponent(url.pathname.split("/")[2]);
    let body = {};
    try {
      body = await parseBody(req);
    } catch (error) {
      return jsonResponse(res, Number(error.statusCode || 400), { ok: false, error: error.message, requestId: id }, id);
    }
    const result = await requestServicePause(serviceKey, { reason: String(body.reason || "operator-request") });
    return jsonResponse(res, result.ok ? 200 : (result.error === "unknown-service" ? 404 : (result.error === "service-busy" ? 409 : 502)), { ...result, requestId: id }, id);
  }
  if (req.method === "POST" && url.pathname.startsWith("/run/")) {
    if (!protectedRoute(req, res, id)) return;
    const jobId = decodeURIComponent(url.pathname.replace("/run/", ""));
    const job = findJob(jobId);
    if (!job) return jsonResponse(res, 404, { ok: false, error: "job-not-found", requestedJob: jobId }, id);
    let body = {};
    try {
      body = await parseBody(req);
    } catch (error) {
      return jsonResponse(res, Number(error.statusCode || 400), { ok: false, error: error.message, requestId: id }, id);
    }
    const result = await runJob(job, { trigger: "manual-run", force: body.force !== false });
    const publicResult = result.ok
      ? {
          ok: true,
          event: result.event || "job-finished",
          jobId: job.id,
          requestId: id,
          statusCode: result.statusCode ?? null,
          startedAt: result.startedAt ?? null,
          finishedAt: result.finishedAt ?? null,
          durationMs: result.durationMs ?? null,
        }
      : {
          ok: false,
          event: "job-failed",
          jobId: job.id,
          error: "Job execution failed",
          requestId: id,
        };
    return jsonResponse(res, result.ok ? 200 : 500, publicResult, id);
  }
  return textResponse(res, 404, "Not found", id);
}

await loadState();

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    const id = requestId(req);
    console.error(JSON.stringify({ service: SERVICE_NAME, event: "request-error", requestId: id, errorName: error?.name || "Error" }));
    jsonResponse(res, 500, { ok: false, error: "Internal server error", requestId: id }, id);
  });
});

server.requestTimeout = numberEnv("HTTP_REQUEST_TIMEOUT_MS", 310_000);
server.headersTimeout = numberEnv("HTTP_HEADERS_TIMEOUT_MS", 30_000);
server.keepAliveTimeout = numberEnv("HTTP_KEEP_ALIVE_TIMEOUT_MS", 5_000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ service: SERVICE_NAME, event: "server-listening", port: PORT, version: APP_VERSION, schedulerEnabled: SCHEDULER_ENABLED }));
  startScheduler();
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ service: SERVICE_NAME, event: "shutdown", signal }));
  if (tickTimer) clearInterval(tickTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
