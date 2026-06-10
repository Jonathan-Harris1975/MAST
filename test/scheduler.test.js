import assert from "node:assert/strict";
import { baseJobs, jobs, pretriggerJobs } from "../src/jobs.js";
import { buildPayload, buildRequestHeaders, dueJobsAt, isTimedJobDue, localParts } from "../src/scheduler.js";

function ids(items) {
  return items.map((item) => item.id).sort();
}

function actualIds(items) {
  return ids(items.filter((item) => !item.managedPretrigger));
}

function at(iso) {
  return new Date(iso);
}

function stateWithHealthAlreadyRun(iso) {
  return {
    lastRunKeys: {},
    intervalLastRunAt: { "suite-health-ping": iso, "hive-keepawake": iso },
  };
}

assert.equal(baseJobs.length, 37, "AIMS scheduled jobs, all monthly audit/council reports, Blotato video jobs, and RAMS protected scheduled/operator jobs should be represented");
assert.equal(pretriggerJobs.length, 81, "MAST should generate three AIMS pretrigger checks for each timed AIMS job");
assert.equal(jobs.length, 118, "jobs should include base jobs plus automatic pretrigger checks");


const blotatoHookdeckTargets = {
  "blotato-news-insight-publish": {
    hookEnv: "HOOK_BLOTATO_NEWS_INSIGHT_URL",
    url: "https://hooks.jonathan-harris.online/g7ncsqagt2wqyq",
    targetPath: "/blotato/shorts/news-insight/publish-now",
  },
  "blotato-model-verdict-publish": {
    hookEnv: "HOOK_BLOTATO_MODEL_VERDICT_URL",
    url: "https://hooks.jonathan-harris.online/rsy7vh21t8un6c",
    targetPath: "/blotato/shorts/model-verdict/publish-now",
  },
  "blotato-ai-at-work-publish": {
    hookEnv: "HOOK_BLOTATO_AI_AT_WORK_URL",
    url: "https://hooks.jonathan-harris.online/5cfbla6oubngjw",
    targetPath: "/blotato/shorts/ai-at-work/publish-now",
  },
  "blotato-reality-check-publish": {
    hookEnv: "HOOK_BLOTATO_REALITY_CHECK_URL",
    url: "https://hooks.jonathan-harris.online/fl60oupriujf53",
    targetPath: "/blotato/shorts/reality-check/publish-now",
  },
  "blotato-ai-playbook-publish": {
    hookEnv: "HOOK_BLOTATO_AI_PLAYBOOK_URL",
    url: "https://hooks.jonathan-harris.online/lbed1dhtigdmjf",
    targetPath: "/blotato/shorts/ai-playbook/publish-now",
  },
};

for (const [id, expected] of Object.entries(blotatoHookdeckTargets)) {
  const job = jobs.find((item) => item.id === id);
  assert.ok(job, `${id} should exist`);
  assert.equal(job.hookEnv, expected.hookEnv, `${id} should use the agreed Hookdeck env variable`);
  assert.equal(job.url, expected.url, `${id} should fall back to the agreed Hookdeck source URL`);
  assert.equal(job.targetPath, expected.targetPath, `${id} should document the AIMS publish-now destination`);
  assert.equal(job.authEnv, "AIMS_API_KEY", `${id} should send AIMS bearer auth`);
}

const socialPerformanceJob = jobs.find((job) => job.id === "social-performance-audit");
assert.ok(socialPerformanceJob, "social-performance-audit should exist");
assert.equal(socialPerformanceJob.group, "audits", "social-performance-audit should be grouped with AIMS audits");
assert.equal(socialPerformanceJob.hookEnv, "HOOK_AUDIT_SOCIAL_PERFORMANCE", "social-performance-audit should support a Hookdeck env override");
assert.equal(socialPerformanceJob.url, "https://app.jonathan-harris.online/audits/social-performance/run", "social-performance-audit should fall back to the direct authenticated AIMS endpoint");
assert.equal(socialPerformanceJob.targetPath, "/audits/social-performance/run", "social-performance-audit should document the AIMS destination");
assert.equal(socialPerformanceJob.authEnv, "AIMS_API_KEY", "social-performance-audit should send AIMS bearer auth");

const monthlyAuditSequence = [
  ["seo-aeo-geo-audit", "audits", "HOOK_AUDIT_SEO_AEO_GEO", "/audits/seo-aeo-geo/run"],
  ["mobile-audit", "audits", "HOOK_AUDIT_MOBILE_UX", "/audits/mobile-ux/run"],
  ["on-brand-audit", "audits", "HOOK_AUDIT_ON_BRAND", "/audits/on-brand/run"],
  ["podcast-website-report", "audits", "HOOK_AUDIT_PODCAST_WEBSITE", "/audits/podcast-website/run"],
  ["social-performance-audit", "audits", "HOOK_AUDIT_SOCIAL_PERFORMANCE", "/audits/social-performance/run"],
  ["brand-social-council-report", "audit-councils", "HOOK_AUDIT_BRAND_SOCIAL_COUNCIL", "/audits/brand-social-council/run"],
  ["seo-aeo-geo-council-report", "audit-councils", "HOOK_AUDIT_SEO_AEO_GEO_COUNCIL", "/audits/seo-aeo-geo-council/run"],
  ["mobile-ux-council-report", "audit-councils", "HOOK_AUDIT_MOBILE_UX_COUNCIL", "/audits/mobile-ux-council/run"],
];

for (const [id, group, hookEnv, targetPath] of monthlyAuditSequence) {
  const job = jobs.find((item) => item.id === id);
  assert.ok(job, `${id} should exist in the monthly audit sequence`);
  assert.equal(job.group, group, `${id} should be grouped correctly`);
  assert.equal(job.hookEnv, hookEnv, `${id} should expose the correct Hookdeck override env`);
  assert.equal(job.targetPath, targetPath, `${id} should target the expected AIMS audit endpoint`);
  assert.equal(job.authEnv, "AIMS_API_KEY", `${id} should send AIMS bearer auth`);
}

assert.equal(socialPerformanceJob.body.thumbnailAudit, true, "social-performance should request thumbnail evidence in the monthly payload");
assert.equal(socialPerformanceJob.body.runCouncil, false, "brand-social council is scheduled explicitly after all inputs are available");

const publicHealthJobs = new Set(["suite-health-ping", "hive-keepawake", "rams-health", ...pretriggerJobs.filter((job) => job.pretriggerStage === "health").map((job) => job.id)]);
for (const healthId of publicHealthJobs) {
  const healthJob = jobs.find((job) => job.id === healthId);
  assert.equal(healthJob.authEnv, null, `${healthId} must remain unauthenticated for liveness checks`);
}

for (const job of jobs.filter((item) => !publicHealthJobs.has(item.id))) {
  const expectedAuthEnv = job.group.startsWith("rams") ? "RMS_API_KEY" : "AIMS_API_KEY";
  assert.equal(job.authEnv, expectedAuthEnv, `${job.id} should send ${expectedAuthEnv} from MAST`);
}

process.env.AIMS_API_KEY = "unit-test-aims-key";
const authHeaders = buildRequestHeaders(jobs.find((job) => job.id === "rss-rewrite"), "unit-run-key");
assert.equal(authHeaders.authorization, "Bearer unit-test-aims-key", "AIMS jobs should receive an Authorization bearer header");
delete process.env.AIMS_API_KEY;
assert.throws(
  () => buildRequestHeaders(jobs.find((job) => job.id === "rss-rewrite"), "unit-run-key"),
  /Missing AIMS_API_KEY/,
  "protected AIMS jobs should fail closed when the configured secret is missing"
);
process.env.AIMS_API_KEY = "{{secret.AIMS_API_KEY}}";
assert.throws(
  () => buildRequestHeaders(jobs.find((job) => job.id === "rss-rewrite"), "unit-run-key"),
  /Missing AIMS_API_KEY/,
  "unresolved secret placeholders should not be sent as bearer credentials"
);
delete process.env.AIMS_API_KEY;

process.env.RMS_API_KEY = "unit-test-rms-key";
const ramsHeaders = buildRequestHeaders(jobs.find((job) => job.id === "rams-readiness"), "unit-rams-run-key");
assert.equal(ramsHeaders.authorization, "Bearer unit-test-rms-key", "RAMS jobs should receive the RMS bearer header");
delete process.env.RMS_API_KEY;

for (const healthId of publicHealthJobs) {
  assert.equal(
    buildRequestHeaders(jobs.find((job) => job.id === healthId), "health-run-key").authorization,
    undefined,
    `${healthId} should not send bearer credentials`
  );
}


assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-04T07:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T07:00:00.000Z"))),
  ["oneup-ebooks-weekly", "rss-rewrite"],
  "Monday 08:00 Europe/London should run RSS rewrite and weekly ebook scheduling during BST"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-04T08:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T08:30:00.000Z"))),
  ["blog-daily-social-build", "outreach-batch-next"],
  "09:30 Europe/London on weekdays should run outreach and the daily social blog build"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-10T08:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-10T08:30:00.000Z"))),
  ["blog-daily-social-build"],
  "daily social blog build should run at 09:30 Europe/London on weekends too"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-08T14:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-08T14:00:00.000Z"))),
  ["podcast-run"],
  "Friday 15:00 Europe/London should run podcast"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-04T11:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T11:00:00.000Z"))),
  ["blog-weekly-build"],
  "weekly blog should run at Monday 12:00 Europe/London during BST"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-03T22:15:00.000Z"), stateWithHealthAlreadyRun("2026-05-03T22:15:00.000Z"))),
  ["oneup-monday"],
  "Monday OneUp post should be prepared Sunday 23:15 Europe/London"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-03T22:20:00.000Z"), stateWithHealthAlreadyRun("2026-05-03T22:20:00.000Z"))),
  ["oneup-weekly-quiz"],
  "weekly quiz should be prepared Sunday 23:20 Europe/London"
);


assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-04T18:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T18:45:00.000Z"))),
  ["blotato-news-insight-publish"],
  "Monday 19:45 Europe/London should publish the Blotato news insight video"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-05T17:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-05T17:45:00.000Z"))),
  ["blotato-model-verdict-publish"],
  "Tuesday 18:45 Europe/London should publish the Blotato model verdict video"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-06T17:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-06T17:45:00.000Z"))),
  ["blotato-ai-at-work-publish"],
  "Wednesday 18:45 Europe/London should publish the Blotato AI at Work video"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-07T17:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-07T17:45:00.000Z"))),
  ["blotato-reality-check-publish"],
  "Thursday 18:45 Europe/London should publish the Blotato reality-check video"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-08T14:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-08T14:45:00.000Z"))),
  ["blotato-ai-playbook-publish"],
  "Friday 15:45 Europe/London should publish the Blotato AI playbook video"
);

const monthlyDueCases = [
  ["2026-06-01T00:00:00.000Z", ["seo-aeo-geo-audit"], "monthly SEO/AEO/GEO audit should run first at 01:00 London on the 1st"],
  ["2026-06-01T00:10:00.000Z", ["mobile-audit"], "monthly mobile UX audit should run second at 01:10 London on the 1st"],
  ["2026-06-01T01:00:00.000Z", ["on-brand-audit"], "monthly on-brand audit should run at 02:00 London on the 1st"],
  ["2026-06-01T01:20:00.000Z", ["podcast-website-report"], "podcast website reports should run before social/council reports"],
  ["2026-06-01T01:40:00.000Z", ["social-performance-audit"], "monthly social-performance audit should run before brand-social council"],
  ["2026-06-01T02:10:00.000Z", ["brand-social-council-report"], "brand/social council should run after its evidence sources"],
  ["2026-06-01T05:00:00.000Z", ["seo-aeo-geo-council-report"], "SEO/AEO/GEO council fallback report should run on the 1st"],
  ["2026-06-01T05:20:00.000Z", ["mobile-ux-council-report"], "Mobile UX council fallback report should run on the 1st"],
  ["2026-06-01T03:30:00.000Z", ["rams-rebuild-on-brand"], "RAMS on-brand rebuild should run on the 1st after the brand/social council"],
  ["2026-06-01T04:00:00.000Z", ["rams-report-on-brand-latest"], "RAMS on-brand report fetch should run on the 1st"],
  ["2026-06-01T05:40:00.000Z", ["rams-rebuild-mobile-ux"], "RAMS mobile UX rebuild should run on the 1st after the mobile council"],
  ["2026-06-01T06:10:00.000Z", ["rams-report-mobile-ux-latest"], "RAMS mobile UX report fetch should run on the 1st"],
  ["2026-06-01T06:40:00.000Z", ["rams-rebuild-seo-aeo-geo"], "RAMS SEO/AEO/GEO rebuild should run on the 1st after the SEO council"],
  ["2026-06-01T07:10:00.000Z", ["rams-report-seo-aeo-geo-latest"], "RAMS SEO/AEO/GEO report fetch should run on the 1st"],
];

for (const [iso, expected, message] of monthlyDueCases) {
  assert.deepEqual(
    actualIds(dueJobsAt(at(iso), stateWithHealthAlreadyRun(iso))),
    expected,
    message
  );
}

const ebookJob = jobs.find((job) => job.id === "oneup-ebooks-weekly");
assert.ok(isTimedJobDue(ebookJob, at("2026-05-04T07:00:00.000Z")), "ebook weekly should run Monday 08:00 Europe/London during BST");
assert.equal(buildPayload(ebookJob, at("2026-05-04T07:00:00.000Z")).weekStartDate, "2026-05-04");

const winterParts = localParts(at("2026-12-07T09:00:00.000Z"), "Europe/London");
assert.equal(winterParts.time, "09:00", "London winter local conversion should stay correct");

const oldIntervalHealthDue = dueJobsAt(at("2026-05-11T00:00:00.000Z"), { lastRunKeys: {}, intervalLastRunAt: {} });
assert.ok(!oldIntervalHealthDue.some((job) => job.id === "suite-health-ping"), "suite health ping should no longer run on a blind interval");
assert.ok(oldIntervalHealthDue.some((job) => job.id === "hive-keepawake"), "HIVE keepawake should run as a gentle interval job when enabled");

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-11T04:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-11T04:00:00.000Z"))),
  ["pretrigger-oneup-ebooks-weekly-health", "pretrigger-rss-rewrite-health"],
  "Monday 05:00 Europe/London should run the T-3h checks for 08:00 London AIMS jobs"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-11T05:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-11T05:00:00.000Z"))),
  ["pretrigger-oneup-ebooks-weekly-preflight", "pretrigger-rss-rewrite-preflight"],
  "Monday 06:00 Europe/London should run the T-2h preflight checks for 08:00 London AIMS jobs"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-11T06:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-11T06:30:00.000Z"))),
  ["pretrigger-blog-daily-social-build-preflight", "pretrigger-oneup-ebooks-weekly-warmup", "pretrigger-outreach-batch-next-preflight", "pretrigger-rss-rewrite-warmup"],
  "Monday 07:30 Europe/London should run the T-30m warmup checks for 08:00 London AIMS jobs"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-11T05:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-11T05:30:00.000Z"))),
  ["pretrigger-blog-daily-social-build-health", "pretrigger-outreach-batch-next-health"],
  "Changing actual service schedules automatically changes the derived T-3h check time"
);

process.env.AIMS_API_KEY = "unit-test-aims-key";
const preflightHeaders = buildRequestHeaders(jobs.find((job) => job.id === "pretrigger-blog-daily-social-build-preflight"), "unit-preflight-key");
assert.equal(preflightHeaders.authorization, "Bearer unit-test-aims-key", "preflight checks should send the AIMS bearer token");
assert.equal(preflightHeaders["x-trigger-pretrigger-stage"], "preflight", "preflight checks should identify their stage");
assert.equal(preflightHeaders["x-trigger-source-job"], "blog-daily-social-build", "preflight checks should identify the source job");
delete process.env.AIMS_API_KEY;

console.log("scheduler tests passed");
