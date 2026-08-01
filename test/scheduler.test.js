import assert from "node:assert/strict";
import test from "node:test";
import { baseJobs, jobs, pretriggerJobs } from "../src/jobs.js";
import { dueJobPriority, isTimedJobDue, requiredServicesReady } from "../src/scheduler.js";

const operationIds = [
  "operation-monday-am", "operation-tuesday-am", "operation-wednesday-am",
  "operation-thursday-am", "operation-friday-am", "operation-friday-pm",
];

const legacyContentIds = [
  "rss-rewrite", "outreach-batch-next", "podcast-run", "blog-weekly-build", "blog-daily-social-build",
  "newsletter-ai-edge-generate", "newsletter-ai-edge-send", "zernio-monday", "zernio-tuesday",
  "zernio-wednesday", "zernio-thursday", "zernio-friday", "zernio-saturday", "zernio-sunday",
  "zernio-weekly-quiz", "zernio-ebooks-weekly", "blotato-news-insight-publish",
  "blotato-model-verdict-publish", "blotato-ai-at-work-publish", "blotato-reality-check-publish",
  "blotato-ai-playbook-publish",
];

test("MAST exposes five AM windows plus the Friday podcast window", () => {
  const operations = baseJobs.filter((job) => job.group === "operations");
  assert.deepEqual(operations.map((job) => job.id).sort(), [...operationIds].sort());
  assert.equal(operations.length, 6);
  for (const job of operations) {
    assert.equal(job.method, "POST");
    assert.equal(job.authEnv, "AIMS_API_KEY");
    assert.match(job.url, /^https:\/\/app\.jonathan-harris\.online\/ops\/run\//);
    assert.equal(job.hookEnv, null);
  }
});

test("weekday AIMS wake is 08:30 and AM operations begin at 09:00", () => {
  const wake = baseJobs.find((job) => job.id === "aims-power-resume-daily");
  assert.deepEqual(wake.schedule.days, ["monday", "tuesday", "wednesday", "thursday", "friday"]);
  assert.equal(wake.schedule.time, "08:30");
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    const am = baseJobs.find((job) => job.id === `operation-${day}-am`);
    assert.equal(am.schedule.time, process.env.MAST_AM_OPERATION_TIME || "09:00");
  }
});

test("legacy task-level content jobs remain manual fallbacks and cannot double-fire", () => {
  for (const id of legacyContentIds) {
    const job = baseJobs.find((item) => item.id === id);
    assert.ok(job, `${id} should remain available for manual recovery`);
    assert.equal(job.schedule.type, "manual", `${id} must not retain an independent schedule`);
    assert.equal(job.hookEnv, null, `${id} must use the direct app endpoint`);
  }
});

test("Friday PM wakes at 14:30 and starts podcast at 15:00", () => {
  const wake = baseJobs.find((job) => job.id === "aims-power-resume-friday-podcast");
  assert.equal(wake.schedule.time, "14:30");
  const job = baseJobs.find((item) => item.id === "operation-friday-pm");
  assert.deepEqual(job.schedule.days, ["friday"]);
  assert.equal(job.schedule.time, process.env.MAST_FRIDAY_PM_OPERATION_TIME || "15:00");
  assert.equal(job.targetPath, "/ops/run/friday-pm");
  assert.match(job.description, /podcast-only/i);
});

test("website and AIMS audits use first and second Saturday only", () => {
  const website = baseJobs.find((job) => job.id === "website-audit-pipeline");
  const aims = baseJobs.find((job) => job.id === "aims-audit-pipeline");
  assert.deepEqual(website.schedule, {
    type: "nth-weekday-monthly", weekday: "saturday", occurrence: 1, time: "15:30", timezone: "Europe/London", catchUpMinutes: 180,
  });
  assert.deepEqual(aims.schedule, {
    type: "nth-weekday-monthly", weekday: "saturday", occurrence: 2, time: "09:15", timezone: "Europe/London",
  });
  assert.equal(website.targetPath, "/audits/website/run");
  assert.equal(aims.targetPath, "/audits/monthly/aims");
  assert.equal(aims.asyncStatus.statusPath, "/audits/content-master/jobs/{id}");
  assert.equal(website.asyncStatus.statusPath, "/audits/website/jobs/{id}");

  assert.equal(isTimedJobDue(website, new Date("2026-08-01T14:30:00.000Z")), true);
  assert.equal(isTimedJobDue(website, new Date("2026-08-01T15:15:00.000Z")), true);
  assert.equal(isTimedJobDue(website, new Date("2026-08-01T17:29:00.000Z")), true);
  assert.equal(isTimedJobDue(website, new Date("2026-08-01T17:31:00.000Z")), false);
  assert.equal(isTimedJobDue(website, new Date("2026-08-08T14:30:00.000Z")), false);
  assert.equal(isTimedJobDue(aims, new Date("2026-08-08T08:15:00.000Z")), true);
});


test("first-Saturday website audit wakes AIMS and RAMS at 15:00", () => {
  for (const id of ["aims-power-resume-website-audit", "rams-power-resume-website-audit"]) {
    const wake = baseJobs.find((job) => job.id === id);
    assert.deepEqual(wake.schedule, {
      type: "nth-weekday-monthly", weekday: "saturday", occurrence: 1, time: "15:00", timezone: "Europe/London", catchUpMinutes: 120,
    });
    assert.equal(isTimedJobDue(wake, new Date("2026-08-01T14:00:00.000Z")), true);
    assert.equal(isTimedJobDue(wake, new Date("2026-08-01T14:25:00.000Z")), true);
    assert.equal(isTimedJobDue(wake, new Date("2026-08-01T15:59:00.000Z")), true);
    assert.equal(isTimedJobDue(wake, new Date("2026-08-01T16:01:00.000Z")), false);
  }
});

test("audit jobs wait until both AIMS and RAMS are online", () => {
  const website = baseJobs.find((job) => job.id === "website-audit-pipeline");
  assert.deepEqual(website.requiredServices, ["aims", "rams"]);
  assert.equal(requiredServicesReady(website, { services: { aims: { state: "online" }, rams: { state: "starting" } } }), false);
  assert.equal(requiredServicesReady(website, { services: { aims: { state: "online" }, rams: { state: "online" } } }), true);
});

test("resume jobs are prioritised before audit work and pause jobs", () => {
  assert.equal(dueJobPriority({ lifecycle: { action: "resume" } }), 0);
  assert.equal(dueJobPriority({ group: "audits" }), 1);
  assert.equal(dueJobPriority({ lifecycle: { action: "pause" } }), 2);
});

test("audit RAMS rebuild routes are manual because AIMS owns sequencing", () => {
  for (const id of ["rams-rebuild-on-brand", "rams-report-on-brand-latest"]) {
    const job = baseJobs.find((item) => item.id === id);
    assert.equal(job.schedule.type, "manual");
  }
});

test("normal AIMS standby is completion-driven and immediate", () => {
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    const pause = baseJobs.find((job) => job.id === `aims-power-pause-${day}-am`);
    assert.deepEqual(pause.schedule, {
      type: "posttrigger", sourceJobId: `operation-${day}-am`, delayMinutes: 0,
    });
  }
  const podcastPause = baseJobs.find((job) => job.id === "aims-power-pause-friday-podcast");
  assert.deepEqual(podcastPause.schedule, {
    type: "posttrigger", sourceJobId: "operation-friday-pm", delayMinutes: 60,
  });
});

test("operation windows do not multiply into per-task pretriggers", () => {
  assert.equal(pretriggerJobs.some((job) => operationIds.includes(job.sourceJobId)), false);
  assert.equal(jobs.filter((job) => job.group === "operations").length, 6);
});

test("HIVE and RAMS governance controls remain present", () => {
  assert.ok(baseJobs.some((job) => job.id === "hive-readiness-check"));
  assert.ok(baseJobs.some((job) => job.id === "rams-readiness"));
  assert.ok(baseJobs.some((job) => job.id === "website-audit-pipeline"));
  assert.ok(baseJobs.some((job) => job.id === "aims-audit-pipeline"));
});
