import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";

test("MAST triggers the KDP audit Monday and research Tuesday to Thursday in London", () => {
  const audit = baseJobs.find((job) => job.id === "kdp-weekly-audit");
  const research = baseJobs.find((job) => job.id === "kdp-weekly-research");
  assert.deepEqual(audit.schedule.days, ["monday"]);
  assert.deepEqual(research.schedule.days, ["tuesday", "wednesday", "thursday"]);
  for (const job of [audit, research]) {
    assert.equal(job.schedule.timezone, "Europe/London");
    assert.equal(job.schedule.time, "12:00");
    assert.equal(job.authEnv, "AIMS_API_KEY");
    assert.equal(job.asyncStatus.statusField, "status");
    assert.equal(job.asyncStatus.terminalResponsePolicy.checks[0].value, true);
  }
  assert.equal(audit.targetPath, "/kdp/audit/run");
  assert.equal(research.targetPath, "/kdp/research/weekly/run");
});
