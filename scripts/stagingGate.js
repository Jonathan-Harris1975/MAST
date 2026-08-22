#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30_000;

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function httpsBase(name) {
  const url = new URL(required(name));
  if (url.protocol !== "https:" && process.env.ECOSYSTEM_SMOKE_ALLOW_HTTP !== "true") {
    throw new Error(`${name} must use https`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

async function requestJson(url, { method = "GET", token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(Number(process.env.STAGING_GATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`${method} ${url} returned ${response.status}: ${payload.error || payload.message || text.slice(0, 300)}`);
  return payload;
}

async function main() {
  const mast = httpsBase("MAST_BASE_URL");
  const token = required("CRON_ADMIN_TOKEN");

  const ready = await requestJson(new URL("/readyz", mast));
  if (!ready.ok) throw new Error("MAST readiness returned ok=false");
  console.log("ok 1 - MAST readiness");

  const registry = await requestJson(new URL("/jobs", mast), { token });
  const ids = new Set((registry.jobs || []).map((job) => job.id));
  for (const requiredJob of ["suite-health-ping", "rams-health", "hive-repo-health-check"]) {
    if (!ids.has(requiredJob)) throw new Error(`MAST job registry is missing ${requiredJob}`);
  }
  console.log("ok 2 - MAST governed job registry");

  for (const [index, jobId, label] of [
    [3, "suite-health-ping", "AIMS health through MAST"],
    [4, "rams-health", "RAMS health through MAST"],
    [5, "hive-repo-health-check", "HIVE repository health through MAST"],
  ]) {
    const result = await requestJson(new URL(`/run/${jobId}`, mast), { method: "POST", token, body: { force: true } });
    if (!result.ok) throw new Error(`${label} returned ok=false`);
    console.log(`ok ${index} - ${label}`);
  }

  const ui = spawnSync(process.execPath, ["scripts/ecosystemSmoke.js"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (ui.status !== 0) throw new Error(`UI ecosystem smoke failed with exit ${ui.status}`);
  console.log("ok 6 - HIVE-UI to AIMS-UI delegated handoff");
  console.log("staging gate passed");
}

main().catch((error) => {
  console.error(`staging gate failed: ${error?.message || String(error)}`);
  process.exitCode = 1;
});
