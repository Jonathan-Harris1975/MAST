import test from "node:test";
import assert from "node:assert/strict";
import { validateJobRegistry } from "../src/schedule-validation.js";
import { jobs } from "../src/jobs.js";

test("production job registry has valid schedules and references", () => {
  assert.deepEqual(validateJobRegistry(jobs), []);
});

test("invalid time and missing source jobs fail closed", () => {
  const invalid = [
    { id: "bad-time", schedule: { type: "weekly", days: ["monday"], time: "25:99", timezone: "Europe/London", catchUpMinutes: 0 } },
    { id: "bad-source", schedule: { type: "posttrigger", sourceJobId: "missing", delayMinutes: 5 } },
  ];
  const errors = validateJobRegistry(invalid);
  assert.ok(errors.some((item) => item.job === "bad-time" && item.field === "schedule.time"));
  assert.ok(errors.some((item) => item.job === "bad-source" && item.field === "schedule.sourceJobId"));
});


test("invalid catch-up and managed trigger delays fail closed", () => {
  const invalid = [
    { id: "bad-catchup", schedule: { type: "weekly", days: ["monday"], time: "10:00", timezone: "Europe/London", catchUpMinutes: Number.NaN } },
    { id: "bad-pretrigger", schedule: { type: "pretrigger", sourceJobId: "source", offsetMinutes: 0 } },
    { id: "bad-posttrigger", schedule: { type: "posttrigger", sourceJobId: "source", delayMinutes: Number.NaN } },
    { id: "source", schedule: { type: "manual" } },
  ];
  const errors = validateJobRegistry(invalid);
  assert.ok(errors.some((item) => item.job === "bad-catchup" && item.field === "schedule.catchUpMinutes"));
  assert.ok(errors.some((item) => item.job === "bad-pretrigger" && item.field === "schedule.offsetMinutes"));
  assert.ok(errors.some((item) => item.job === "bad-posttrigger" && item.field === "schedule.delayMinutes"));
});
