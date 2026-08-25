import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { baseJobs } from "../src/jobs.js";

test("production operation timing assumes AIMS is continuously available", () => {
  assert.equal(baseJobs.some((job) => job.group === "power-aims"), false);
  const monday = baseJobs.find((job) => job.id === "operation-monday-am");
  const fridayPm = baseJobs.find((job) => job.id === "operation-friday-pm");
  assert.equal(monday.schedule.time, process.env.MAST_AM_OPERATION_TIME || "10:00");
  assert.equal(fridayPm.schedule.time, process.env.MAST_FRIDAY_PM_OPERATION_TIME || "15:00");
  assert.equal(fridayPm.schedule.catchUpMinutes, Number(process.env.MAST_FRIDAY_PM_OPERATION_CATCH_UP_MINUTES || 180));
  assert.deepEqual(fridayPm.requiredServices, ["aims"]);
  assert.equal(monday.schedule.catchUpMinutes, Number(process.env.MAST_AM_OPERATION_CATCH_UP_MINUTES || 180));
  assert.deepEqual(monday.requiredServices, ["aims"]);
});

test("production env patch keeps operation polling and canonical times", async () => {
  const patch = await readFile(new URL("../MAST-KOYEB-PRODUCTION-ENV-PATCH.txt", import.meta.url), "utf8");
  assert.match(patch, /^MAST_AM_OPERATION_TIME=10:00$/m);
  assert.match(patch, /^MAST_AM_OPERATION_CATCH_UP_MINUTES=180$/m);
  assert.match(patch, /^MAST_FRIDAY_PM_OPERATION_TIME=15:00$/m);
  assert.match(patch, /^MAST_FRIDAY_PM_OPERATION_CATCH_UP_MINUTES=180$/m);
  assert.match(patch, /^MAST_WEBSITE_AUDIT_WAKE_TIME=10:00$/m);
  assert.match(patch, /^MAST_WEBSITE_AUDIT_RUN_TIME=10:30$/m);
  assert.match(patch, /^MAST_AIMS_AUDIT_WAKE_TIME=09:00$/m);
  assert.match(patch, /^MAST_AIMS_AUDIT_RUN_TIME=09:15$/m);
  assert.match(patch, /^MAST_AIMS_AUDIT_WAKE_CATCH_UP_MINUTES=120$/m);
  assert.match(patch, /^MAST_AIMS_AUDIT_RUN_CATCH_UP_MINUTES=180$/m);
  assert.match(patch, /^SERVICE_RESUME_POLL_MAX_ATTEMPTS=180$/m);
  assert.match(patch, /^SERVICE_RESUME_POLL_INTERVAL_MS=5000$/m);
  assert.match(patch, /^SERVICE_HEALTH_PROBE_TIMEOUT_MS=15000$/m);
  assert.match(patch, /^MAST_AIMS_OPERATION_POLL_INTERVAL_MS=15000$/m);
  assert.match(patch, /^MAST_AIMS_OPERATION_TIMEOUT_MS=28800000$/m);
  assert.match(patch, /^KOYEB_POWER_MANAGEMENT_ENABLED=true$/m);
  assert.match(patch, /^KOYEB_TOKEN=\{\{ secret\.KOYEB_TOKEN \}\}$/m);
  assert.match(patch, /^KOYEB_SERVICE_ID_AIMS=\{\{ secret\.KOYEB_SERVICE_ID_AIMS \}\}$/m);
  assert.match(patch, /^AIMS_BASE_URL=https:\/\/zeroth-kara-jonathanharris-3296ed37\.koyeb\.app$/m);
  assert.match(patch, /^MAST_STATE_BACKEND=r2$/m);
  assert.doesNotMatch(patch, /MAST_WEBSITE_AUDIT_TEST_/);
});


test("operation triggers fail closed when AIMS omits a pollable job", async () => {
  const scheduler = await readFile(new URL("../src/scheduler.js", import.meta.url), "utf8");
  assert.match(scheduler, /AIMS operation response was not valid JSON/);
  assert.match(scheduler, /AIMS operation response omitted job\.id/);
});


test("stale lifecycle records are re-probed before a due job is blocked", async () => {
  const scheduler = await readFile(new URL("../src/scheduler.js", import.meta.url), "utf8");
  assert.match(scheduler, /reconcileDueJobServiceReadiness/);
  assert.match(scheduler, /scheduled-readiness-reprobe-succeeded/);
  assert.match(scheduler, /job-blocked-required-services/);
  assert.match(scheduler, /SERVICE_RESUME_POLL_MAX_ATTEMPTS", 180/);
  assert.match(scheduler, /SERVICE_HEALTH_PROBE_TIMEOUT_MS", 15_000/);
});
