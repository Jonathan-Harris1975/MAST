import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";

test("the read-only print-capacity checkpoint runs Monday through Thursday in the isolated evening lane", () => {
  const job = baseJobs.find((item) => item.id === "kdp-print-rollout-capacity-plan");
  assert.ok(job);
  assert.equal(job.group, "kdp");
  assert.equal(job.schedule.type, "weekly");
  assert.deepEqual(job.schedule.days, ["monday", "tuesday", "wednesday", "thursday"]);
  assert.ok(!job.schedule.days.includes("friday"));
  assert.equal(job.schedule.time, "22:15");
  assert.equal(job.schedule.catchUpMinutes, 90);
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

// This tests dispatch/catch-up separation, not termination of earlier async jobs.
test("other KDP dispatch windows close before print capacity planning", () => {
  const print = baseJobs.find((item) => item.id === "kdp-print-rollout-capacity-plan");
  const minutes = (clock) => {
    const [hours, mins] = clock.split(":").map(Number);
    return hours * 60 + mins;
  };
  assert.equal(minutes(print.schedule.time) + print.schedule.catchUpMinutes, minutes("23:45"));
  for (const job of baseJobs.filter((item) => item.group === "kdp" && item.id !== print.id)) {
    if (job.schedule.type !== "weekly") continue;
    if (!job.schedule.days.some((day) => print.schedule.days.includes(day))) continue;
    const lastDispatch = minutes(job.schedule.time) + (job.schedule.catchUpMinutes ?? 0);
    assert.ok(lastDispatch < minutes(print.schedule.time),
      `${job.id} has a KDP dispatch/catch-up window overlapping print planning`);
  }
});
