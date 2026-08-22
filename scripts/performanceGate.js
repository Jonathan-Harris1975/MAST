#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";
import { performance } from "node:perf_hooks";

const REQUESTS = Math.max(20, Number(process.env.PERF_HEALTH_REQUESTS || 120));
const CONCURRENCY = Math.max(1, Number(process.env.PERF_HEALTH_CONCURRENCY || 12));
const MAX_P95_MS = Math.max(1, Number(process.env.PERF_HEALTH_P95_MS || 250));
const MAX_MEAN_MS = Math.max(1, Number(process.env.PERF_HEALTH_MEAN_MS || 125));
const MAX_ERROR_RATE = Math.max(0, Number(process.env.PERF_HEALTH_MAX_ERROR_RATE || 0));

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] || 0;
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function timedRequest(url) {
  const started = performance.now();
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, ms: performance.now() - started };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), ms: performance.now() - started };
  }
}

async function waitForHealth(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await timedRequest(url);
    if (result.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("MAST performance gate server did not become healthy");
}

async function runPool(url) {
  let cursor = 0;
  const results = new Array(REQUESTS);
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= REQUESTS) return;
      results[index] = await timedRequest(url);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, REQUESTS) }, () => worker()));
  return results;
}

const port = await freePort();
const child = spawn(process.execPath, ["src/index.js"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PORT: String(port),
    APP_ENV: "development",
    MAST_STATE_BACKEND: "local",
    ALLOW_EPHEMERAL_STATE: "true",
    STATE_FILE: `/tmp/mast-perf-${process.pid}.json`,
    SCHEDULER_ENABLED: "false",
    CRON_ADMIN_TOKEN: "ci-performance-token",
    KOYEB_POWER_MANAGEMENT_ENABLED: "false",
  },
});
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += String(chunk); });

try {
  const url = `http://127.0.0.1:${port}/health`;
  await waitForHealth(url);
  for (let i = 0; i < 10; i += 1) await timedRequest(url);
  const results = await runPool(url);
  const latencies = results.map((item) => item.ms);
  const failures = results.filter((item) => !item.ok);
  const meanMs = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  const p95Ms = percentile(latencies, 0.95);
  const p99Ms = percentile(latencies, 0.99);
  const errorRate = failures.length / results.length;
  const report = {
    ok: failures.length === 0 && p95Ms <= MAX_P95_MS && meanMs <= MAX_MEAN_MS && errorRate <= MAX_ERROR_RATE,
    endpoint: "/health",
    requests: REQUESTS,
    concurrency: CONCURRENCY,
    meanMs: Number(meanMs.toFixed(2)),
    p95Ms: Number(p95Ms.toFixed(2)),
    p99Ms: Number(p99Ms.toFixed(2)),
    errors: failures.length,
    errorRate: Number(errorRate.toFixed(4)),
    slo: { maxP95Ms: MAX_P95_MS, maxMeanMs: MAX_MEAN_MS, maxErrorRate: MAX_ERROR_RATE },
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  if (stderr.trim()) console.error(stderr.trim());
  process.exitCode = 1;
} finally {
  if (!child.killed) child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
