import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";

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
