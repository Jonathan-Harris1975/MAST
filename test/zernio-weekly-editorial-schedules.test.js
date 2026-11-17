import test from "node:test";
import assert from "node:assert/strict";
import { baseJobs } from "../src/jobs.js";
import { isTimedJobDue } from "../src/scheduler.js";

test("MAST schedules independent Monday mini-series and Thursday podcast promotion", () => {
  for (const [id, day, time, path, lane] of [
    ["zernio-weekly-mini-series", "monday", "14:30", "/zernio/mini-series/weekly", "weekly-mini-series"],
    ["zernio-thursday-podcast-promo", "thursday", "14:30", "/zernio/podcast/thursday-promo", "podcast-thursday-promo"],
  ]) {
    const job = baseJobs.find(item => item.id === id);
    assert.ok(job);
    assert.deepEqual(job.schedule.days, [day]);
    assert.equal(job.schedule.time, time);
    assert.equal(job.schedule.timezone, "Europe/London");
    assert.equal(job.executionLane, "aims-heavy");
    assert.equal(job.group, "zernio-editorial");
    assert.equal(job.authEnv, "AIMS_API_KEY");
    assert.equal(job.targetPath, path);
    assert.equal(job.asyncStatus.statusPath, `/zernio/jobs/${lane}/{id}`);
    assert.equal(job.asyncStatus.statusField, "status");
    assert.equal(job.asyncStatus.terminalResponsePolicy.checks[0].path, "result.ok");
    assert.equal(job.asyncStatus.terminalResponsePolicy.checks[0].value, true);
    assert.equal(job.requestRetries, 0);
    assert.equal(job.consumeFailureWindow, true);
    assert.equal(job.schedule.catchUpMinutes, 150);
  }
  const mini = baseJobs.find(x => x.id === "zernio-weekly-mini-series");
  const promo = baseJobs.find(x => x.id === "zernio-thursday-podcast-promo");
  assert.equal(isTimedJobDue(mini, new Date("2026-11-16T14:30:00Z")), true);
  assert.equal(isTimedJobDue(mini, new Date("2026-11-17T14:30:00Z")), false);
  assert.equal(isTimedJobDue(promo, new Date("2026-11-19T14:30:00Z")), true);
  assert.equal(isTimedJobDue(promo, new Date("2026-11-18T14:30:00Z")), false);
});

test("Mast does not double-schedule Friday or unrelated daily Zernio content", () => {
  const scheduled = baseJobs.filter(job => job.group === "zernio-editorial");
  assert.deepEqual(scheduled.map(job => job.id).sort(), [
    "zernio-thursday-podcast-promo",
    "zernio-weekly-mini-series",
  ]);
  const daily = baseJobs.filter(job => /^zernio-(monday|thursday)$/.test(job.id));
  assert.equal(daily.every(job => job.schedule.type === "manual"), true);
  for (const day of ["monday", "thursday"]) {
    const at = "14:30";
    assert.equal(baseJobs.filter(job => job.executionLane === "aims-heavy" &&
      job.schedule?.type === "weekly" && job.schedule?.time === at &&
      job.schedule.days?.includes(day)).length, 1);
  }
});
