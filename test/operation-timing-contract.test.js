import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { baseJobs } from "../src/jobs.js";

test("production operation timing has a warm-up gap", () => {
  const dailyWake = baseJobs.find((job) => job.id === "aims-power-resume-daily");
  const fridayWake = baseJobs.find((job) => job.id === "aims-power-resume-friday-podcast");
  const monday = baseJobs.find((job) => job.id === "operation-monday-am");
  const fridayPm = baseJobs.find((job) => job.id === "operation-friday-pm");
  assert.equal(dailyWake.schedule.time, "08:30");
  assert.equal(monday.schedule.time, process.env.MAST_AM_OPERATION_TIME || "09:00");
  assert.equal(fridayWake.schedule.time, "14:30");
  assert.equal(fridayPm.schedule.time, process.env.MAST_FRIDAY_PM_OPERATION_TIME || "15:00");
  assert.notEqual(fridayWake.schedule.time, fridayPm.schedule.time);
});

test("production env patch keeps operation polling and canonical times", async () => {
  const patch = await readFile(new URL("../MAST-KOYEB-PRODUCTION-ENV-PATCH.txt", import.meta.url), "utf8");
  assert.match(patch, /^MAST_AM_OPERATION_TIME=09:00$/m);
  assert.match(patch, /^MAST_FRIDAY_PM_OPERATION_TIME=15:00$/m);
  assert.match(patch, /^MAST_WEBSITE_AUDIT_WAKE_TIME=20:00$/m);
  assert.match(patch, /^MAST_WEBSITE_AUDIT_RUN_TIME=20:30$/m);
  assert.match(patch, /^MAST_AIMS_OPERATION_POLL_INTERVAL_MS=15000$/m);
  assert.match(patch, /^MAST_AIMS_OPERATION_TIMEOUT_MS=28800000$/m);
  assert.match(patch, /^KOYEB_POWER_MANAGEMENT_ENABLED=true$/m);
  assert.match(patch, /^KOYEB_TOKEN=\{\{ secret\.KOYEB_TOKEN \}\}$/m);
  assert.match(patch, /^KOYEB_SERVICE_ID_AIMS=\{\{ secret\.KOYEB_SERVICE_ID_AIMS \}\}$/m);
  assert.match(patch, /^AIMS_BASE_URL=https:\/\/app\.jonathan-harris\.online$/m);
  assert.match(patch, /^MAST_STATE_BACKEND=r2$/m);
});


test("failed AIMS operation windows cannot trigger automatic standby", async () => {
  const scheduler = await readFile(new URL("../src/scheduler.js", import.meta.url), "utf8");
  assert.match(scheduler, /operationJob\.status === "completed"/);
  assert.match(scheduler, /Number\(operationJob\.failures \|\| 0\) === 0/);
  assert.match(scheduler, /const jobOk = response\.ok && operationOk/);
});

test("operation triggers fail closed when AIMS omits a pollable job", async () => {
  const scheduler = await readFile(new URL("../src/scheduler.js", import.meta.url), "utf8");
  assert.match(scheduler, /AIMS operation response was not valid JSON/);
  assert.match(scheduler, /AIMS operation response omitted job\.id/);
});
