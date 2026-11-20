import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";

test("live print production dispatches the AIMS publishing worker Monday–Thursday", () => {
  const job = baseJobs.find(item => item.id === "kdp-print-production");
  assert.ok(job);
  assert.equal(job.group, "kdp");
  assert.equal(job.schedule.type, "weekly");
  assert.deepEqual(job.schedule.days, ["monday", "tuesday", "wednesday", "thursday"]);
  assert.equal(job.schedule.time, "16:10");
  assert.equal(job.schedule.catchUpMinutes, 20);
  assert.equal(job.schedule.timezone, "Europe/London");
  assert.equal(job.targetPath, "/kdp/print/production/run");
  assert.equal(job.authEnv, "AIMS_API_KEY");
  assert.equal(job.requestRetries, 0);
  assert.equal(job.asyncStatus.statusPath, "/kdp/jobs/print-production/{id}");
  assert.deepEqual(job.asyncStatus.terminalResponsePolicy.checks.map(({ path, value }) => ({ path, value })), [
    { path: "result.ok", value: true },
    { path: "result.schemaVersion", value: 1 },
    { path: "result.capacity.weeklyLimitPerFormat", value: 10 },
    { path: "result.maxBooksPerRun", value: 3 },
    { path: "result.quotaUsageAfter.weeklyLimitPerFormat", value: 10 },
    { path: "result.externalWeeklyLimitDetected", value: false },
  ]);
  assert.ok(!baseJobs.some(item => item.id === "kdp-print-rollout-capacity-plan"),
    "Capacity planning must not be mistaken for an additional print production run.");
});

test("Monday source preflight and Friday book creation are untouched", () => {
  const preflight = baseJobs.find(item => item.id === "kdp-print-preflight");
  assert.deepEqual(preflight.schedule.days, ["monday"]);
  assert.equal(preflight.schedule.time, "15:30");
});

test("print publication stays within the daytime production window and uses the serialised KDP lane", () => {
  const print = baseJobs.find(item => item.id === "kdp-print-production");
  const minutes = clock => { const [hours, mins] = clock.split(":").map(Number); return hours * 60 + mins; };
  assert.ok(minutes(print.schedule.time) + print.schedule.catchUpMinutes < minutes("23:45"));
  assert.equal(print.executionLane, "aims-heavy");
  assert.ok(minutes(print.schedule.time) >= minutes("07:00"));
  assert.ok(minutes(print.schedule.time) + print.schedule.catchUpMinutes <= minutes("19:00"));
  for (const job of baseJobs.filter(item => item.group === "kdp" && item.id !== print.id)) {
    if (job.schedule.type !== "weekly") continue;
    if (!job.schedule.days.some(day => print.schedule.days.includes(day))) continue;
    assert.equal(job.executionLane, "aims-heavy", job.id + " must share the KDP serialisation lane");
  }
});
