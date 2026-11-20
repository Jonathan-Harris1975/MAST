import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";

test("UK royalty-floor reconciliation uses three guarded Monday–Thursday AIMS jobs", () => {
  const jobs = baseJobs.filter((job) => job.id.startsWith("kdp-uk-royalty-floor-"));
  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map((job) => job.schedule.time), ["14:35", "16:35", "17:35"]);
  for (const job of jobs) {
    assert.equal(job.group, "kdp");
    assert.equal(job.targetPath, "/kdp/audit/pricing/royalty-floor/run");
    assert.equal(job.authEnv, "AIMS_API_KEY");
    assert.deepEqual(job.schedule.days, ["monday", "tuesday", "wednesday", "thursday"]);
    assert.equal(job.schedule.timezone, "Europe/London");
    assert.equal(job.schedule.catchUpMinutes, job.schedule.time === "16:35" ? 145 : job.schedule.time === "17:35" ? 85 : 30);
    assert.deepEqual(job.body, { dryRun: false });
    assert.equal(job.requestRetries, 0);
    assert.equal(job.asyncStatus.statusPath, "/kdp/jobs/audit-royalty-floor/{id}");
    assert.equal(job.asyncStatus.terminalResponsePolicy.checks[0].value, true);
  }
});
