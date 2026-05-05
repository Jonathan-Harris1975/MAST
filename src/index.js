import http from "node:http";
import { jobs, SERVICE_NAME } from "./jobs.js";
import {
  booleanEnv,
  findJob,
  getStatus,
  loadState,
  numberEnv,
  publicJob,
  runDueJobs,
  runJob,
} from "./scheduler.js";

const PORT = Number(process.env.PORT || 8000);
const SCHEDULER_ENABLED = booleanEnv("SCHEDULER_ENABLED", true);
const TICK_SECONDS = numberEnv("SCHEDULER_TICK_SECONDS", 20);
const ADMIN_TOKEN = process.env.CRON_ADMIN_TOKEN || "";
const ALLOW_PUBLIC_MANUAL_RUNS = booleanEnv("ALLOW_PUBLIC_MANUAL_RUNS", false);

let tickInProgress = false;
let lastTickResult = null;
let tickTimer = null;

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function textResponse(res, statusCode, text) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function isAuthorised(req) {
  if (ALLOW_PUBLIC_MANUAL_RUNS) return true;
  if (!ADMIN_TOKEN) return false;

  const auth = req.headers.authorization || "";
  if (auth === `Bearer ${ADMIN_TOKEN}`) return true;

  const token = req.headers["x-cron-admin-token"];
  return token === ADMIN_TOKEN;
}

function protectedRoute(req, res) {
  if (isAuthorised(req)) return true;
  jsonResponse(res, 401, {
    ok: false,
    error: "manual-run-requires-cron-admin-token",
    hint: "Set CRON_ADMIN_TOKEN in Koyeb and send Authorization: Bearer <token>.",
  });
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

  console.log(JSON.stringify({
    service: SERVICE_NAME,
    event: "scheduler-started",
    tickSeconds: TICK_SECONDS,
    jobCount: jobs.length,
  }));

  setTimeout(() => schedulerTick("startup-tick"), 3_000).unref?.();
  tickTimer = setInterval(() => schedulerTick("scheduled-tick"), intervalMs);
}

async function route(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    return jsonResponse(res, 200, {
      ok: true,
      service: SERVICE_NAME,
      schedulerEnabled: SCHEDULER_ENABLED,
      tickSeconds: TICK_SECONDS,
      jobCount: jobs.length,
      lastTickResult,
    });
  }

  if (req.method === "GET" && url.pathname === "/jobs") {
    const now = new Date();
    return jsonResponse(res, 200, {
      ok: true,
      service: SERVICE_NAME,
      jobCount: jobs.length,
      jobs: jobs.map((job) => publicJob(job, now)),
    });
  }

  if (req.method === "GET" && url.pathname === "/status") {
    return jsonResponse(res, 200, await getStatus());
  }

  if (req.method === "POST" && url.pathname === "/tick") {
    if (!protectedRoute(req, res)) return;
    const result = await schedulerTick("manual-tick");
    return jsonResponse(res, result.ok ? 200 : 500, result);
  }

  if (req.method === "POST" && url.pathname.startsWith("/run/")) {
    if (!protectedRoute(req, res)) return;

    const id = decodeURIComponent(url.pathname.replace("/run/", ""));
    const job = findJob(id);
    if (!job) {
      return jsonResponse(res, 404, {
        ok: false,
        error: "job-not-found",
        requestedJob: id,
        availableJobs: jobs.map((item) => item.id),
      });
    }

    let body = {};
    try {
      body = await parseBody(req);
    } catch (error) {
      return jsonResponse(res, 400, { ok: false, error: error.message });
    }

    const force = body.force !== false;
    const result = await runJob(job, { trigger: "manual-run", force });
    return jsonResponse(res, result.ok ? 200 : 500, result);
  }

  return textResponse(res, 404, "Not found");
}

await loadState();

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(JSON.stringify({
      service: SERVICE_NAME,
      event: "request-error",
      errorName: error?.name || "Error",
      errorMessage: error?.message || String(error),
    }));
    jsonResponse(res, 500, { ok: false, error: error?.message || String(error) });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({
    service: SERVICE_NAME,
    event: "server-listening",
    port: PORT,
    schedulerEnabled: SCHEDULER_ENABLED,
  }));
  startScheduler();
});

function shutdown(signal) {
  console.log(JSON.stringify({ service: SERVICE_NAME, event: "shutdown", signal }));
  if (tickTimer) clearInterval(tickTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
