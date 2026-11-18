import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs, pretriggerJobs } from "../src/jobs.js";
import { isTimedJobDue } from "../src/scheduler.js";

test("free podcast discovery is scheduled once weekly without changing production windows", () => {
  const growthJobs = baseJobs.filter(x => x.id === "podcast-organic-discovery-weekly");
  assert.equal(growthJobs.length, 1);
  const job = growthJobs[0];
  assert.equal(job.method, "POST");
  assert.equal(job.targetPath, "/ops/podcast-growth/snapshot");
  assert.equal(job.authEnv, "AIMS_API_KEY");
  assert.deepEqual(job.requiredServices, ["aims"]);
  assert.deepEqual(job.schedule.days, ["wednesday"]);
  assert.equal(job.schedule.time, "14:10");
  assert.equal(job.schedule.timezone, "Europe/London");
  assert.equal(job.requestRetries, 0);
  assert.equal(job.consumeFailureWindow, false);
  assert.equal(job.responsePolicy.checks[0].path, "ok");
  assert.equal(isTimedJobDue(job, new Date("2026-11-18T14:10:00Z")), true);
  assert.equal(isTimedJobDue(job, new Date("2026-11-17T14:10:00Z")), false);
  assert.equal(baseJobs.find(x => x.id === "zernio-thursday-podcast-promo").schedule.time, "14:30");
  assert.equal(baseJobs.find(x => x.id === "podcast-run").schedule.type, "manual");
  assert.ok(baseJobs.find(x => x.id === "aims-audit-pipeline"));
  assert.equal(baseJobs.filter(x => x.id === "podcast-organic-discovery-weekly").length, 1);
  assert.equal(pretriggerJobs.filter(x => x.sourceJobId === "podcast-organic-discovery-weekly").length, 0);
});
