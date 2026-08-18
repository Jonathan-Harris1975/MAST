import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { assertProductionSecurityConfig } from "../src/security.js";

const port = 18765;
let child;

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("MAST test server did not start");
}

test("MAST exposes hardened health and readiness contracts", async (t) => {
  child = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      APP_ENV: "development",
      CRON_ADMIN_TOKEN: "test-admin-token",
      AIMS_API_KEY: "test-aims-token",
      RMS_API_KEY: "test-rams-token",
      KOYEB_POWER_MANAGEMENT_ENABLED: "true",
      KOYEB_TOKEN: "test-koyeb-token",
      KOYEB_SERVICE_ID_AIMS: "test-aims-service",
      KOYEB_SERVICE_ID_RAMS: "test-rams-service",
      SCHEDULER_ENABLED: "true",
      SCHEDULER_STARTUP_TICK_ENABLED: "false",
      MAST_STATE_BACKEND: "local",
      ALLOW_EPHEMERAL_STATE: "true",
      STATE_FILE: `/tmp/mast-http-contract-${process.pid}.json`,
    },
    stdio: "ignore",
  });
  t.after(() => child?.kill("SIGKILL"));

  const health = await waitForHealth();
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  const healthBody = await health.json();
  assert.equal(healthBody.status, "healthy");
  assert.equal(healthBody.version, "1.2.3");

  const ready = await fetch(`http://127.0.0.1:${port}/readyz`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).status, "ready");

  const status = await fetch(`http://127.0.0.1:${port}/status`);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).ok, true);

  const details = await fetch(`http://127.0.0.1:${port}/status/details`, {
    headers: { Authorization: "Bearer test-admin-token" },
  });
  assert.equal(details.status, 200);
  assert.equal(Array.isArray((await details.json()).jobs), true);

  const unauthorised = await fetch(`http://127.0.0.1:${port}/tick`, { method: "POST" });
  assert.equal(unauthorised.status, 401);
});


test("MAST refuses public manual controls in production", () => {
  assert.throws(
    () => assertProductionSecurityConfig({
      appEnv: "production",
      allowPublicManualRuns: true,
      stateStatus: { ready: true, durable: true, backend: "r2" },
    }),
    /ALLOW_PUBLIC_MANUAL_RUNS cannot be enabled in production/,
  );
});

test("MAST refuses ephemeral scheduler state in production", () => {
  assert.throws(
    () => assertProductionSecurityConfig({
      appEnv: "production",
      allowPublicManualRuns: false,
      stateStatus: { ready: false, durable: false, backend: "local" },
    }),
    /requires a configured, ready R2 state backend/,
  );
});
