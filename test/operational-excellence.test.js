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
