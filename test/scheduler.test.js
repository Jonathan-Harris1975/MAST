import assert from "node:assert/strict";
import { jobs } from "../src/jobs.js";
import { buildPayload, dueJobsAt, isTimedJobDue, localParts } from "../src/scheduler.js";

function ids(items) {
  return items.map((item) => item.id).sort();
}

function at(iso) {
  return new Date(iso);
}

function stateWithHealthAlreadyRun(iso) {
  return {
    lastRunKeys: {},
    intervalLastRunAt: { "suite-health-ping": iso },
  };
}

assert.equal(jobs.length, 18, "all current Cloudflare cron jobs plus the daily social blog job should be represented");

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-04T08:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T08:00:00.000Z"))),
  ["rss-rewrite"],
  "daily RSS should run at 09:00 Europe/London during BST"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-04T08:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T08:30:00.000Z"))),
  ["blog-daily-social-build", "outreach-batch-next"],
  "09:30 Europe/London on weekdays should run outreach and the daily social blog build"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-10T08:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-10T08:30:00.000Z"))),
  ["blog-daily-social-build"],
  "daily social blog build should run at 09:30 Europe/London on weekends too"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-08T09:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-08T09:00:00.000Z"))),
  ["podcast-run"],
  "Friday 10:00 Europe/London should run podcast"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-04T15:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T15:00:00.000Z"))),
  ["blog-weekly-build"],
  "weekly blog should run at Monday 16:00 Europe/London during BST"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-03T22:15:00.000Z"), stateWithHealthAlreadyRun("2026-05-03T22:15:00.000Z"))),
  ["oneup-monday"],
  "Monday OneUp post should be prepared Sunday 23:15 Europe/London"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-03T22:20:00.000Z"), stateWithHealthAlreadyRun("2026-05-03T22:20:00.000Z"))),
  ["oneup-weekly-quiz"],
  "weekly quiz should be prepared Sunday 23:20 Europe/London"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-06-01T02:00:00.000Z"), stateWithHealthAlreadyRun("2026-06-01T02:00:00.000Z"))),
  ["mobile-audit", "on-brand-audit", "seo-aeo-geo-audit"],
  "monthly audits should remain pinned to 02:00 UTC on the 1st"
);

const ebookJob = jobs.find((job) => job.id === "oneup-ebooks-weekly");
assert.ok(isTimedJobDue(ebookJob, at("2026-05-04T07:00:00.000Z")), "ebook weekly should run Monday 08:00 Europe/London during BST");
assert.equal(buildPayload(ebookJob, at("2026-05-04T07:00:00.000Z")).weekStartDate, "2026-05-04");

const winterParts = localParts(at("2026-12-07T09:00:00.000Z"), "Europe/London");
assert.equal(winterParts.time, "09:00", "London winter local conversion should stay correct");

const healthDue = dueJobsAt(at("2026-05-04T00:00:00.000Z"), { lastRunKeys: {}, intervalLastRunAt: {} });
assert.ok(healthDue.some((job) => job.id === "suite-health-ping"), "health ping should run when it has no previous timestamp");

console.log("scheduler tests passed");
