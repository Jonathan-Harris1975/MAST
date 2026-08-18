import assert from "node:assert/strict";
import test from "node:test";
import { baseJobs, jobs, pretriggerJobs } from "../src/jobs.js";
import { dueJobPriority, isTimedJobDue, jobScheduleDue, requiredServiceStates, requiredServicesReady } from "../src/scheduler.js";

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
    assert.equal(job.urlEnv, null);
  }
});

test("weekday AIMS wake is 09:30 and AM operations begin at 10:00 with catch-up protection", () => {
  const wake = baseJobs.find((job) => job.id === "aims-power-resume-daily");
  assert.deepEqual(wake.schedule.days, ["monday", "tuesday", "wednesday", "thursday", "friday"]);
  assert.equal(wake.schedule.time, process.env.MAST_AM_WAKE_TIME || "09:30");
  assert.equal(wake.schedule.catchUpMinutes, Number(process.env.MAST_AM_WAKE_CATCH_UP_MINUTES || 120));
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    const am = baseJobs.find((job) => job.id === `operation-${day}-am`);
    assert.equal(am.schedule.time, process.env.MAST_AM_OPERATION_TIME || "10:00");
    assert.equal(am.schedule.catchUpMinutes, Number(process.env.MAST_AM_OPERATION_CATCH_UP_MINUTES || 180));
    assert.deepEqual(am.requiredServices, ["aims"]);
  }
});

test("legacy task-level content jobs remain manual fallbacks and cannot double-fire", () => {
  for (const id of legacyContentIds) {
    const job = baseJobs.find((item) => item.id === id);
    assert.ok(job, `${id} should remain available for manual recovery`);
    assert.equal(job.schedule.type, "manual", `${id} must not retain an independent schedule`);
    assert.equal(job.urlEnv, null, `${id} must use the direct app endpoint`);
  }
});

test("manual Blotato recovery uses governed schedule routes, never immediate publish", () => {
  const blotatoIds = legacyContentIds.filter((id) => id.startsWith("blotato-") && id.endsWith("-publish"));
  assert.equal(blotatoIds.length, 5);
  for (const id of blotatoIds) {
    const job = baseJobs.find((item) => item.id === id);
    assert.ok(job, `${id} should exist`);
    assert.match(job.targetPath, /^\/blotato\/shorts\/[^/]+\/schedule$/);
    assert.match(job.targetUrl, /^https:\/\/app\.jonathan-harris\.online\/blotato\/shorts\/[^/]+\/schedule$/);
    assert.doesNotMatch(job.targetPath, /publish-now/);
  }
});

test("HIVE governance and optimisation schedules are fully wired", () => {
  const expected = new Map([
    ["hive-readiness-check", ["weekly", "06:00", "/v1/runtime/readiness"]],
    ["hive-repo-health-check", ["weekly", "06:05", "/v1/system/repo-health"]],
    ["hive-provider-health-check", ["weekly", "06:10", "/v1/providers/health"]],
    ["hive-env-audit", ["weekly", "06:25", "/v1/environment/audit"]],
    ["hive-model-registry-snapshot", ["weekly", "06:55", "/v1/model-registry"]],
    ["hive-ai-council-run", ["monthly", "07:00", "/v1/ai-council/run"]],
    ["hive-optimisation-stats-snapshot", ["monthly", "07:16", "/v1/optimisation/stats"]],
    ["hive-monthly-review-generate", ["monthly", "07:25", "/v1/monthly-review/generate"]],
  ]);
  for (const [id, [type, time, path]] of expected) {
    const job = baseJobs.find((item) => item.id === id);
    assert.ok(job, `${id} should be scheduled`);
    assert.equal(job.schedule.type, type);
    assert.equal(job.schedule.time, time);
    assert.equal(job.targetPath, path);
    assert.equal(job.authEnv, "HIVE_ADMIN_BEARER_TOKEN");
  }
});

test("Friday PM wakes at 14:30 and starts podcast at 15:00", () => {
  const wake = baseJobs.find((job) => job.id === "aims-power-resume-friday-podcast");
  assert.equal(wake.schedule.time, process.env.MAST_FRIDAY_PM_WAKE_TIME || "14:30");
  assert.equal(wake.schedule.catchUpMinutes, Number(process.env.MAST_FRIDAY_PM_WAKE_CATCH_UP_MINUTES || 120));
  const job = baseJobs.find((item) => item.id === "operation-friday-pm");
  assert.deepEqual(job.schedule.days, ["friday"]);
  assert.equal(job.schedule.time, process.env.MAST_FRIDAY_PM_OPERATION_TIME || "15:00");
  assert.equal(job.schedule.catchUpMinutes, Number(process.env.MAST_FRIDAY_PM_OPERATION_CATCH_UP_MINUTES || 180));
  assert.deepEqual(job.requiredServices, ["aims"]);
  assert.equal(job.targetPath, "/ops/run/friday-pm");
  assert.match(job.description, /podcast-only/i);
});

test("website audit uses the first Sunday while the AIMS audit remains second Saturday", () => {
  const website = baseJobs.find((job) => job.id === "website-audit-pipeline");
  const aims = baseJobs.find((job) => job.id === "aims-audit-pipeline");
  assert.deepEqual(website.schedule, {
    type: "nth-weekday-monthly", weekday: "sunday", occurrence: 1, time: "10:30", timezone: "Europe/London", catchUpMinutes: 180,
  });
  assert.deepEqual(aims.schedule, {
    type: "nth-weekday-monthly", weekday: "saturday", occurrence: 2, time: "09:15", timezone: "Europe/London", catchUpMinutes: 180,
  });
  assert.equal(website.targetPath, "/audits/website/run");
  assert.equal(aims.targetPath, "/audits/monthly/aims");
  assert.equal(aims.asyncStatus.statusPath, "/audits/content-master/jobs/{id}");
  assert.equal(website.asyncStatus.statusPath, "/audits/website/jobs/{id}");

  // 10:30 Europe/London is 09:30 UTC during British Summer Time.
  assert.equal(isTimedJobDue(website, new Date("2026-08-02T09:30:00.000Z")), true);
  assert.equal(isTimedJobDue(website, new Date("2026-08-02T12:29:00.000Z")), true);
  assert.equal(isTimedJobDue(website, new Date("2026-08-02T12:31:00.000Z")), false);
  assert.equal(isTimedJobDue(website, new Date("2026-08-09T09:30:00.000Z")), false);
  assert.equal(isTimedJobDue(aims, new Date("2026-08-08T08:15:00.000Z")), true);
});


test("first-Sunday website audit wakes AIMS and RAMS at 10:00", () => {
  for (const id of ["aims-power-resume-website-audit", "rams-power-resume-website-audit"]) {
    const wake = baseJobs.find((job) => job.id === id);
    assert.deepEqual(wake.schedule, {
      type: "nth-weekday-monthly", weekday: "sunday", occurrence: 1, time: "10:00", timezone: "Europe/London", catchUpMinutes: 120,
    });
    assert.equal(isTimedJobDue(wake, new Date("2026-08-02T09:00:00.000Z")), true);
    assert.equal(isTimedJobDue(wake, new Date("2026-08-02T10:59:00.000Z")), true);
    assert.equal(isTimedJobDue(wake, new Date("2026-08-02T11:01:00.000Z")), false);
  }
});


test("second-Saturday AIMS audit wake and run have catch-up protection", () => {
  const audit = baseJobs.find((job) => job.id === "aims-audit-pipeline");
  assert.equal(audit.schedule.time, process.env.MAST_AIMS_AUDIT_RUN_TIME || "09:15");
  assert.equal(audit.schedule.catchUpMinutes, Number(process.env.MAST_AIMS_AUDIT_RUN_CATCH_UP_MINUTES || 180));
  for (const id of ["aims-power-resume-aims-audit", "rams-power-resume-aims-audit"]) {
    const wake = baseJobs.find((job) => job.id === id);
    assert.equal(wake.schedule.time, process.env.MAST_AIMS_AUDIT_WAKE_TIME || "09:00");
    assert.equal(wake.schedule.catchUpMinutes, Number(process.env.MAST_AIMS_AUDIT_WAKE_CATCH_UP_MINUTES || 120));
  }
});

test("website audit pretriggers run after the 10:00 wake", () => {
  const stages = Object.fromEntries(pretriggerJobs
    .filter((job) => job.sourceJobId === "website-audit-pipeline")
    .map((job) => [job.pretriggerStage, job.pretriggerOffsetMinutes]));
  assert.deepEqual(stages, { health: 20, preflight: 15, warmup: 10 });
});

test("website audit dispatch requires AIMS only because RAMS is a downstream handoff", () => {
  const website = baseJobs.find((job) => job.id === "website-audit-pipeline");
  assert.deepEqual(website.requiredServices, ["aims"]);
  assert.equal(requiredServicesReady(website, { services: { aims: { state: "starting" }, rams: { state: "online" } } }), false);
  assert.equal(requiredServicesReady(website, { services: { aims: { state: "online" }, rams: { state: "offline" } } }), true);
  assert.deepEqual(requiredServiceStates(website, { services: { aims: { state: "offline", reason: "stale-ledger" } } }), [
    { service: "aims", state: "offline", reason: "stale-ledger", lastError: null },
  ]);
});

test("schedule eligibility remains visible even when the lifecycle ledger is stale", () => {
  const website = baseJobs.find((job) => job.id === "website-audit-pipeline");
  const at = new Date("2026-08-02T09:30:00.000Z");
  const staleState = { lastRunKeys: {}, intervalLastRunAt: {}, services: { aims: { state: "offline" } } };
  assert.equal(jobScheduleDue(website, at, staleState), true);
  assert.equal(requiredServicesReady(website, staleState), false);
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

test("no temporary or one-off audit fires remain in the production schedule", () => {
  const oneOffAudits = baseJobs.filter((job) => job.group === "audits" && job.schedule.type === "once");
  assert.deepEqual(oneOffAudits, []);
  assert.equal(baseJobs.some((job) => /recovery|2026-08-03/.test(job.id)), false);
  assert.equal(pretriggerJobs.some((job) => /recovery|2026-08-03/.test(job.sourceJobId || job.id)), false);
});
