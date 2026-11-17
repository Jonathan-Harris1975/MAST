import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";
import { isTimedJobDue } from "../src/scheduler.js";

test("monthly HIVE governance starts once through the D1-backed async route", () => {
  const job = baseJobs.find((candidate) => candidate.id === "hive-monthly-governance-review");
  assert.ok(job, "MAST must own a monthly HIVE governance schedule");
  assert.equal(job.method, "POST");
  assert.equal(job.targetPath, "/v1/monthly-review/generate");
  assert.equal(job.requestRetries, 0);
  assert.equal(job.consumeFailureWindow, true);
  assert.deepEqual(job.asyncStatus, {
    responseIdField: "period",
    statusPath: "/v1/monthly-review/jobs/{id}",
    statusField: "state.status",
    successStatuses: ["completed"],
    pendingStatuses: ["claimed"],
    failureStatuses: ["failed"],
    terminalResponsePolicy: {
      checks: [
        {
          type: "equals",
          path: "state.status",
          value: "completed",
          message: "HIVE monthly governance did not persist completed status.",
        },
      ],
    },
  });
});

test("monthly optimisation statistics wait for a verified completed Council plus 15 minutes", () => {
  const job = baseJobs.find(candidate => candidate.id === "hive-optimisation-stats-snapshot");
  assert.deepEqual(job.schedule, {
    type: "posttrigger", sourceJobId: "hive-monthly-governance-review", delayMinutes: 15,
  });
  const afterFailed = { recentResults: [{ job: "hive-monthly-governance-review",
    ok: false, finishedAt: "2026-11-01T09:00:00Z" }], lastRunKeys: {} };
  assert.equal(isTimedJobDue(job, new Date("2026-11-01T12:00:00Z"), afterFailed), false);
  const afterSuccess = { recentResults: [{ job: "hive-monthly-governance-review",
    ok: true, finishedAt: "2026-11-01T09:00:00Z" }], lastRunKeys: {} };
  assert.equal(isTimedJobDue(job, new Date("2026-11-01T09:14:00Z"), afterSuccess), false);
  assert.equal(isTimedJobDue(job, new Date("2026-11-01T09:15:00Z"), afterSuccess), true);
});
