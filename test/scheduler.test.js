import assert from "node:assert/strict";
import test from "node:test";
import { baseJobs, jobs, pretriggerJobs } from "../src/jobs.js";
import { isTimedJobDue } from "../src/scheduler.js";

const operationIds = [
  "operation-monday-am", "operation-monday-pm",
  "operation-tuesday-am", "operation-tuesday-pm",
  "operation-wednesday-am", "operation-wednesday-pm",
  "operation-thursday-am", "operation-thursday-pm",
  "operation-friday-am", "operation-friday-pm",
];

const legacyContentIds = [
  "rss-rewrite", "outreach-batch-next", "podcast-run", "blog-weekly-build", "blog-daily-social-build",
  "newsletter-ai-edge-generate", "newsletter-ai-edge-send", "zernio-monday", "zernio-tuesday",
  "zernio-wednesday", "zernio-thursday", "zernio-friday", "zernio-saturday", "zernio-sunday",
  "zernio-weekly-quiz", "zernio-ebooks-weekly", "blotato-news-insight-publish",
  "blotato-model-verdict-publish", "blotato-ai-at-work-publish", "blotato-reality-check-publish",
  "blotato-ai-playbook-publish",
];

test("MAST exposes exactly ten consolidated weekday content-operation triggers", () => {
  const operations = baseJobs.filter((job) => job.group === "operations");
  assert.deepEqual(operations.map((job) => job.id).sort(), [...operationIds].sort());
  assert.equal(operations.length, 10);
  for (const job of operations) {
    assert.equal(job.method, "POST");
    assert.equal(job.authEnv, "AIMS_API_KEY");
    assert.match(job.url, /^https:\/\/app\.jonathan-harris\.online\/ops\/run\//);
    assert.equal(job.hookEnv, null);
  }
});

test("weekday AIMS wake is 09:00 and AM operations begin after warmup", () => {
  const wake = baseJobs.find((job) => job.id === "aims-power-resume-daily");
  assert.deepEqual(wake.schedule.days, ["monday", "tuesday", "wednesday", "thursday", "friday"]);
  assert.equal(wake.schedule.time, "09:00");
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    const am = baseJobs.find((job) => job.id === `operation-${day}-am`);
    assert.equal(am.schedule.time, process.env.MAST_AM_OPERATION_TIME || "09:15");
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

test("Friday PM is the extended weekend handoff window", () => {
  const job = baseJobs.find((item) => item.id === "operation-friday-pm");
  assert.deepEqual(job.schedule.days, ["friday"]);
  assert.equal(job.targetPath, "/ops/run/friday-pm");
  assert.match(job.description, /podcast/i);
  assert.match(job.description, /Saturday\/Sunday Zernio/i);
});

test("website and AIMS audits use first and second Saturday only", () => {
  const website = baseJobs.find((job) => job.id === "website-audit-pipeline");
  const aims = baseJobs.find((job) => job.id === "aims-audit-pipeline");
  assert.deepEqual(website.schedule, {
    type: "nth-weekday-monthly", weekday: "saturday", occurrence: 1, time: "09:15", timezone: "Europe/London",
  });
  assert.deepEqual(aims.schedule, {
    type: "nth-weekday-monthly", weekday: "saturday", occurrence: 2, time: "09:15", timezone: "Europe/London",
  });
  assert.equal(website.targetPath, "/audits/website/run");
  assert.equal(aims.targetPath, "/audits/aims/run");

  assert.equal(isTimedJobDue(website, new Date("2026-08-01T08:15:00.000Z")), true);
  assert.equal(isTimedJobDue(website, new Date("2026-08-08T08:15:00.000Z")), false);
  assert.equal(isTimedJobDue(aims, new Date("2026-08-08T08:15:00.000Z")), true);
});

test("audit RAMS rebuild routes are manual because AIMS owns sequencing", () => {
  for (const id of ["rams-rebuild-on-brand", "rams-report-on-brand-latest"]) {
    const job = baseJobs.find((item) => item.id === id);
    assert.equal(job.schedule.type, "manual");
  }
});

test("AIMS and RAMS shutdowns are completion-driven by 60-minute posttriggers", () => {
  const fridayPause = baseJobs.find((job) => job.id === "aims-power-pause-friday");
  assert.deepEqual(fridayPause.schedule, {
    type: "posttrigger", sourceJobId: "operation-friday-pm", delayMinutes: 60,
  });
  for (const id of [
    "aims-power-pause-after-website-audit",
    "aims-power-pause-after-aims-audit",
    "rams-power-pause-after-website-audit",
    "rams-power-pause-after-aims-audit",
  ]) {
    const job = baseJobs.find((item) => item.id === id);
    assert.equal(job.schedule.type, "posttrigger");
    assert.equal(job.schedule.delayMinutes, 60);
  }
});

test("operation windows do not multiply into per-task pretriggers", () => {
  assert.equal(pretriggerJobs.some((job) => operationIds.includes(job.sourceJobId)), false);
  assert.equal(jobs.filter((job) => job.group === "operations").length, 10);
});

test("HIVE and RAMS governance controls remain present", () => {
  assert.ok(baseJobs.some((job) => job.id === "hive-readiness-check"));
  assert.ok(baseJobs.some((job) => job.id === "rams-readiness"));
  assert.ok(baseJobs.some((job) => job.id === "website-audit-pipeline"));
  assert.ok(baseJobs.some((job) => job.id === "aims-audit-pipeline"));
});
