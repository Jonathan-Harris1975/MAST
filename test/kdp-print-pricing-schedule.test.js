import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";

test("print pricing automatically runs twice per weekday without touching Friday publishing", () => {
  const jobs = baseJobs.filter(job => job.id.startsWith("kdp-print-pricing-"));
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map(job => job.schedule.time).sort(), ["15:40", "17:10"]);
  for (const job of jobs) {
    assert.deepEqual(job.schedule.days, ["monday","tuesday","wednesday","thursday"]);
    assert.equal(job.schedule.timezone, "Europe/London");
    assert.equal(job.schedule.catchUpMinutes, 15);
    assert.equal(job.targetPath, "/kdp/audit/pricing/print/run");
    assert.deepEqual(job.body, { dryRun: false });
    assert.equal(job.requestRetries, 0);
    assert.equal(job.asyncStatus.statusPath, "/kdp/jobs/audit-print-pricing/{id}");
    assert.deepEqual(job.asyncStatus.terminalResponsePolicy.checks.map(check => [check.path, check.value]),
      [["result.ok", true],["result.schemaVersion", 1]]);
  }
});

test("print pricing doesn't replace any existing Kindle royalty-floor update or print production run", () => {
  for (const time of ["14:35","16:35","17:35"]) {
    assert.ok(baseJobs.find(job => job.id === "kdp-uk-royalty-floor-" + time.replace(":", "")));
  }
  const print = baseJobs.find(job => job.id === "kdp-print-production");
  assert.equal(print.schedule.time, "16:00");
  assert.equal(print.schedule.days.includes("friday"), false);
  assert.equal(baseJobs.some(job => job.id.startsWith("kdp-print-pricing-") &&
    job.schedule.days.includes("friday")), false);
});
