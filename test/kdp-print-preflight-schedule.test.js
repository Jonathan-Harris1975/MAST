import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";

test("print preflight is an independent Monday preparation checkpoint", () => {
  const job = baseJobs.find((item) => item.id === "kdp-print-preflight");
  assert.ok(job);
  assert.equal(job.group, "kdp");
  assert.deepEqual(job.schedule.days, ["monday"]);
  assert.equal(job.schedule.timezone, "Europe/London");
  assert.equal(job.schedule.time, "15:30");
  assert.equal(job.targetPath, "/kdp/print/preflight/run");
  assert.equal(job.authEnv, "AIMS_API_KEY");
  assert.equal(job.asyncStatus.statusPath, "/kdp/jobs/print-preflight/{id}");
  assert.deepEqual(job.asyncStatus.terminalResponsePolicy.checks.map((check) => check.value), [true, false]);
  assert.equal(baseJobs.find((item) => item.id === "kdp-weekly-audit").schedule.time, "12:00");
  assert.equal(baseJobs.find((item) => item.id === "kdp-weekly-research").schedule.time, "12:00");
});
