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

assert.equal(baseJobs.length, 41, "AIMS scheduled jobs, all monthly audit/council reports, Blotato video jobs, RAMS protected scheduled/operator jobs, and Koyeb power-management jobs should be represented");
assert.equal(pretriggerJobs.length, 81, "MAST should generate three AIMS pretrigger checks for each timed AIMS job");
assert.equal(jobs.length, 122, "jobs should include base jobs plus automatic pretrigger checks");


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
  const expectedAuthEnv = job.group.startsWith("power")
    ? "KOYEB_TOKEN"
    : job.group.startsWith("rams")
      ? "RMS_API_KEY"
      : "AIMS_API_KEY";
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
  ["rss-rewrite"],
  "Monday 08:00 Europe/London should run RSS rewrite during BST"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-04T08:40:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T08:40:00.000Z"))),
  ["outreach-batch-next"],
  "09:40 Europe/London on weekdays should run the outreach batch"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-04T09:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T09:30:00.000Z"))),
  ["blog-daily-social-build"],
  "10:30 Europe/London should run the daily social blog build"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-09T09:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-09T09:30:00.000Z"))),
  ["blog-daily-social-build"],
  "daily social blog build should run at 10:30 Europe/London on weekends too"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-04T10:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T10:00:00.000Z"))),
  ["oneup-ebooks-weekly"],
  "weekly ebook scheduling should run at Monday 11:00 Europe/London during BST"
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
  actualIds(dueJobsAt(at("2026-05-03T18:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-03T18:30:00.000Z"))),
  ["oneup-monday"],
  "Monday OneUp post should be prepared Sunday 19:30 Europe/London, inside the AIMS power window"
);

assert.deepEqual(
  actualIds(dueJobsAt(at("2026-05-03T18:35:00.000Z"), stateWithHealthAlreadyRun("2026-05-03T18:35:00.000Z"))),
  ["oneup-weekly-quiz"],
  "weekly quiz should be prepared Sunday 19:35 Europe/London, inside the AIMS power window"
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
  ["2026-06-01T07:00:00.000Z", ["rams-power-resume-monthly", "rss-rewrite"], "RAMS should resume at 08:00 London on the 1st, alongside the daily 08:00 rss-rewrite"],
  ["2026-06-01T07:30:00.000Z", ["rams-rebuild-on-brand"], "RAMS on-brand rebuild should run at 08:30 London on the 1st, 30 min after RAMS resumes"],
  ["2026-06-01T08:00:00.000Z", ["rams-report-on-brand-latest"], "RAMS on-brand report fetch should run at 09:00 London on the 1st"],
  ["2026-06-01T09:40:00.000Z", ["rams-rebuild-mobile-ux"], "RAMS mobile UX rebuild should run at 10:40 London on the 1st"],
  ["2026-06-01T10:10:00.000Z", ["rams-report-mobile-ux-latest"], "RAMS mobile UX report fetch should run at 11:10 London on the 1st"],
  ["2026-06-01T10:40:00.000Z", ["rams-rebuild-seo-aeo-geo"], "RAMS SEO/AEO/GEO rebuild should run at 11:40 London on the 1st"],
  ["2026-06-01T11:10:00.000Z", ["rams-report-seo-aeo-geo-latest"], "RAMS SEO/AEO/GEO report fetch should run at 12:10 London on the 1st, still well inside the 8am-8pm RAMS window"],
  ["2026-06-01T14:00:00.000Z", ["seo-aeo-geo-audit"], "monthly SEO/AEO/GEO audit should run first at 15:00 London on the 1st"],
  ["2026-06-01T14:20:00.000Z", ["mobile-audit"], "monthly mobile UX audit should run second at 15:20 London on the 1st"],
  ["2026-06-01T15:00:00.000Z", ["on-brand-audit"], "monthly on-brand audit should run at 16:00 London on the 1st"],
  ["2026-06-01T15:30:00.000Z", ["podcast-website-report"], "podcast website reports should run before social/council reports"],
  ["2026-06-01T15:40:00.000Z", ["social-performance-audit"], "monthly social-performance audit should run before brand-social council"],
  ["2026-06-01T16:10:00.000Z", ["brand-social-council-report"], "brand/social council should run after its evidence sources"],
  ["2026-06-01T17:00:00.000Z", ["seo-aeo-geo-council-report"], "SEO/AEO/GEO council fallback report should run on the 1st"],
  ["2026-06-01T17:20:00.000Z", ["mobile-ux-council-report"], "Mobile UX council fallback report should run on the 1st"],
];

for (const [iso, expected, message] of monthlyDueCases) {
  assert.deepEqual(
    actualIds(dueJobsAt(at(iso), stateWithHealthAlreadyRun(iso))),
    expected,
    message
  );
}

const ebookJob = jobs.find((job) => job.id === "oneup-ebooks-weekly");
assert.ok(isTimedJobDue(ebookJob, at("2026-05-04T10:00:00.000Z")), "ebook weekly should run Monday 11:00 Europe/London during BST");
assert.equal(buildPayload(ebookJob, at("2026-05-04T10:00:00.000Z")).weekStartDate, "2026-05-04");

const winterParts = localParts(at("2026-12-07T09:00:00.000Z"), "Europe/London");
assert.equal(winterParts.time, "09:00", "London winter local conversion should stay correct");

const oldIntervalHealthDue = dueJobsAt(at("2026-05-11T00:00:00.000Z"), { lastRunKeys: {}, intervalLastRunAt: {} });
assert.ok(!oldIntervalHealthDue.some((job) => job.id === "suite-health-ping"), "suite health ping should no longer run on a blind interval");
assert.ok(oldIntervalHealthDue.some((job) => job.id === "hive-keepawake"), "HIVE keepawake should run as a gentle interval job when enabled");

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-11T04:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-11T04:00:00.000Z"))),
  ["pretrigger-rss-rewrite-health"],
  "Monday 05:00 Europe/London should run the T-3h check for the 08:00 London rss-rewrite job"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-11T05:00:00.000Z"), stateWithHealthAlreadyRun("2026-05-11T05:00:00.000Z"))),
  ["pretrigger-rss-rewrite-preflight"],
  "Monday 06:00 Europe/London should run the T-2h preflight check for the 08:00 London rss-rewrite job"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-11T06:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-11T06:30:00.000Z"))),
  ["aims-power-resume-daily", "pretrigger-blog-daily-social-build-health", "pretrigger-rss-rewrite-warmup"],
  "Monday 07:30 Europe/London should run the T-30m rss-rewrite warmup and T-3h blog-daily-social-build health check, alongside the AIMS power-management resume"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-11T05:30:00.000Z"), stateWithHealthAlreadyRun("2026-05-11T05:30:00.000Z"))),
  [],
  "Nothing should be due at 06:30 Europe/London between the rss-rewrite preflight and warmup checks"
);

process.env.AIMS_API_KEY = "unit-test-aims-key";
const preflightHeaders = buildRequestHeaders(jobs.find((job) => job.id === "pretrigger-blog-daily-social-build-preflight"), "unit-preflight-key");
assert.equal(preflightHeaders.authorization, "Bearer unit-test-aims-key", "preflight checks should send the AIMS bearer token");
assert.equal(preflightHeaders["x-trigger-pretrigger-stage"], "preflight", "preflight checks should identify their stage");
assert.equal(preflightHeaders["x-trigger-source-job"], "blog-daily-social-build", "preflight checks should identify the source job");
delete process.env.AIMS_API_KEY;

// --- Koyeb power management (cost optimisation) ---

const powerJobIds = ["aims-power-resume-daily", "aims-power-pause-daily", "rams-power-resume-monthly", "rams-power-pause-monthly"];
for (const id of powerJobIds) {
  const job = baseJobs.find((item) => item.id === id);
  assert.ok(job, `${id} should exist`);
  assert.equal(job.authEnv, "KOYEB_TOKEN", `${id} should authorise against Koyeb, not AIMS/RAMS`);
  assert.equal(job.method, "POST", `${id} should POST to the Koyeb pause/resume endpoint`);
}

assert.equal(
  jobs.filter((job) => job.managedPretrigger && powerJobIds.includes(job.sourceJobId)).length,
  0,
  "Koyeb power jobs should not generate AIMS-style pretrigger checks (they authorise against KOYEB_TOKEN, not AIMS_API_KEY)"
);

function dueIncludes(iso, jobId, label) {
  const due = ids(dueJobsAt(at(iso), { lastRunKeys: {}, intervalLastRunAt: {} }));
  assert.ok(due.includes(jobId), `${label} (got: ${due.join(", ") || "<nothing due>"})`);
}

dueIncludes("2026-06-01T06:30:00.000Z", "aims-power-resume-daily", "AIMS should resume daily at 07:30 Europe/London");
dueIncludes("2026-06-01T19:00:00.000Z", "aims-power-pause-daily", "AIMS should pause daily at 20:00 Europe/London");
dueIncludes("2026-07-01T07:00:00.000Z", "rams-power-resume-monthly", "RAMS should resume at 08:00 Europe/London on the 1st, ahead of the 08:30 rebuild sequence, inside the 8am-8pm window");
dueIncludes("2026-07-01T19:00:00.000Z", "rams-power-pause-monthly", "RAMS should pause at 20:00 Europe/London on the 1st, at the same boundary as AIMS's daily pause, once its full 08:30-12:10 sequence is long done");

// --- oneup-daily / weekly quiz moved inside the AIMS 08:00-20:00 window ---

dueIncludes("2026-06-07T18:30:00.000Z", "oneup-monday", "oneup-monday should now queue at 19:30 Europe/London (Sunday evening), inside the AIMS power window");
dueIncludes("2026-06-07T18:35:00.000Z", "oneup-weekly-quiz", "oneup-weekly-quiz should now queue at 19:35 Europe/London on Sundays, inside the AIMS power window");

assert.ok(
  !ids(dueJobsAt(at("2026-06-07T22:15:00.000Z"), { lastRunKeys: {}, intervalLastRunAt: {} })).includes("oneup-monday"),
  "oneup-monday should no longer fire at its old 23:15 Europe/London slot"
);

console.log("scheduler tests passed");
