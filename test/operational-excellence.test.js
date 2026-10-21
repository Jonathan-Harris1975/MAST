import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("operator control can pause the Worker without a deployment", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mast-ops-"));
  process.env.MAST_STATE_BACKEND = "local";
  process.env.STATE_FILE = path.join(tempDir, "state.json");
  process.env.SCHEDULER_ENABLED = "false";

  try {
    const scheduler = await import(`../src/scheduler.js?ops-test=${Date.now()}`);
    const control = await scheduler.loadOperatorControl();
    assert.equal(control.schedulerEnabled, false);
    assert.equal(control.maintenanceMode, false);

    const result = await scheduler.runDueJobs({
      at: new Date("2026-06-17T12:00:00.000Z"),
      trigger: "operator-control-test",
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "scheduler-paused");

    const status = await scheduler.getStatus();
    assert.equal(status.state.operator.schedulerEnabled, false);
    assert.equal(status.state.metrics.ticks, 1);
  } finally {
    delete process.env.MAST_STATE_BACKEND;
    delete process.env.STATE_FILE;
    delete process.env.SCHEDULER_ENABLED;
    await rm(tempDir, { recursive: true, force: true });
  }
});


test("operator pause during a due-job batch defers remaining work for the next tick", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mast-ops-batch-"));
  const envNames = ["MAST_STATE_BACKEND", "STATE_FILE", "SCHEDULER_ENABLED", "HIVE_ADMIN_BEARER_TOKEN", "BETWEEN_JOBS_MS"];
  const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let calls = 0;

  process.env.MAST_STATE_BACKEND = "local";
  process.env.STATE_FILE = path.join(tempDir, "state.json");
  process.env.SCHEDULER_ENABLED = "true";
  process.env.HIVE_ADMIN_BEARER_TOKEN = "test-token";
  process.env.BETWEEN_JOBS_MS = "0";
  await import("node:fs/promises").then(({ writeFile }) => writeFile(
    process.env.STATE_FILE,
    JSON.stringify({ services: { hive: { state: "online" } } }),
    "utf8",
  ));
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) process.env.SCHEDULER_ENABLED = "false";
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const scheduler = await import(`../src/scheduler.js?ops-batch-test=${Date.now()}`);
    const at = new Date("2026-10-21T05:15:00.000Z"); // 06:15 Europe/London
    const stopped = await scheduler.runDueJobs({ at, trigger: "operator-control-batch-test" });

    assert.equal(stopped.partial, true);
    assert.equal(stopped.skipped, false);
    assert.equal(stopped.ran, 1);
    assert.ok(stopped.deferred.length > 0);
    assert.equal(stopped.results.length, 1);
    assert.equal(calls, 1);

    process.env.SCHEDULER_ENABLED = "true";
    const resumed = await scheduler.runDueJobs({ at, trigger: "operator-control-batch-test-resume" });
    assert.ok(resumed.ran > 0);
    assert.equal(resumed.results[0].job, stopped.deferred[0]);
    assert.equal(calls, 1 + resumed.ran);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
