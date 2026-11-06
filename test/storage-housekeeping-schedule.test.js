import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";

test("governed storage maintenance runs weekly in London and verifies the async result", () => {
  const matches = baseJobs.filter((job) => job.id === "storage-housekeeping-weekly");
  assert.equal(matches.length, 1);
  const job = matches[0];
  assert.deepEqual(job.schedule, { type: "weekly", days: ["sunday"], time: "05:30", timezone: "Europe/London", catchUpMinutes: 720 });
  assert.equal(job.targetPath, "/storage/housekeeping/run");
  assert.equal(job.authEnv, "AIMS_API_KEY");
  assert.deepEqual(job.requiredServices, ["aims"]);
  assert.equal(job.body.dryRun, false);
  assert.equal(job.body.confirmation, "run-governed-storage-housekeeping");
  assert.equal(job.asyncStatus.statusPath, "/storage/housekeeping/jobs/weekly/{id}");
  const checks = job.asyncStatus.terminalResponsePolicy.checks;
  assert.ok(checks.some((check) => check.path === "result.ok" && check.value === true));
  assert.ok(checks.some((check) => check.path === "result.coverage.kdpD1Touched" && check.value === false));
});
