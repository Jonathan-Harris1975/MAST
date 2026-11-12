import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";

test("the print-capacity checkpoint runs only Monday through Thursday at 17:10 London", () => {
  const job = baseJobs.find((item) => item.id === "kdp-print-rollout-capacity-plan");
  assert.ok(job);
  assert.equal(job.group, "kdp");
  assert.equal(job.schedule.type, "weekly");
  assert.deepEqual(job.schedule.days, ["monday", "tuesday", "wednesday", "thursday"]);
  assert.ok(!job.schedule.days.includes("friday"));
  assert.equal(job.schedule.time, "17:10");
  assert.equal(job.schedule.timezone, "Europe/London");
  assert.equal(job.targetPath, "/kdp/print/rollout/plan/run");
  assert.equal(job.authEnv, "AIMS_API_KEY");
  assert.equal(job.requestRetries, 0);
  assert.equal(job.asyncStatus.statusPath, "/kdp/jobs/print-rollout-plan/{id}");
  assert.deepEqual(job.asyncStatus.terminalResponsePolicy.checks.map(({ path, value }) => ({ path, value })), [
    { path: "result.ok", value: true },
    { path: "result.kdpWritesPerformed", value: false },
  ]);
});
test("existing Monday preflight and weekly new-book slots remain distinct", () => {
  const preflight = baseJobs.find((item) => item.id === "kdp-print-preflight");
  assert.deepEqual(preflight.schedule.days, ["monday"]);
  assert.equal(preflight.schedule.time, "15:30");
});
