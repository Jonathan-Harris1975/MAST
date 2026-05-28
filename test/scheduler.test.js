import assert from "node:assert/strict";
import { jobs } from "../src/jobs.js";
import { buildPayload, buildRequestHeaders, dueJobsAt, isTimedJobDue, localParts } from "../src/scheduler.js";

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

assert.equal(jobs.length, 31, "AIMS scheduled jobs, Blotato video jobs, and RAMS protected scheduled/operator jobs should be represented");


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

const publicHealthJobs = new Set(["suite-health-ping", "rams-health"]);
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
  ids(dueJobsAt(at("2026-05-04T18:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-04T18:45:00.000Z"))),
  ["blotato-news-insight-publish"],
  "Monday 19:45 Europe/London should publish the Blotato news insight video"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-05T17:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-05T17:45:00.000Z"))),
  ["blotato-model-verdict-publish"],
  "Tuesday 18:45 Europe/London should publish the Blotato model verdict video"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-06T17:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-06T17:45:00.000Z"))),
  ["blotato-ai-at-work-publish"],
  "Wednesday 18:45 Europe/London should publish the Blotato AI at Work video"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-07T17:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-07T17:45:00.000Z"))),
  ["blotato-reality-check-publish"],
  "Thursday 18:45 Europe/London should publish the Blotato reality-check video"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-05-08T14:45:00.000Z"), stateWithHealthAlreadyRun("2026-05-08T14:45:00.000Z"))),
  ["blotato-ai-playbook-publish"],
  "Friday 15:45 Europe/London should publish the Blotato AI playbook video"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-06-01T02:00:00.000Z"), stateWithHealthAlreadyRun("2026-06-01T02:00:00.000Z"))),
  ["mobile-audit", "on-brand-audit", "seo-aeo-geo-audit"],
  "monthly AIMS audits should remain pinned to 02:00 UTC on the 1st"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-06-02T01:00:00.000Z"), stateWithHealthAlreadyRun("2026-06-02T01:00:00.000Z"))),
  ["rams-rebuild-on-brand"],
  "RAMS on-brand rebuild should run on the 2nd at 02:00 Europe/London during BST"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-06-02T03:00:00.000Z"), stateWithHealthAlreadyRun("2026-06-02T03:00:00.000Z"))),
  ["rams-report-on-brand-latest"],
  "RAMS on-brand report fetch should run on the 2nd at 04:00 Europe/London during BST"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-06-03T01:00:00.000Z"), stateWithHealthAlreadyRun("2026-06-03T01:00:00.000Z"))),
  ["rams-rebuild-mobile-ux"],
  "RAMS mobile UX rebuild should run on the 3rd at 02:00 Europe/London during BST"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-06-03T04:00:00.000Z"), stateWithHealthAlreadyRun("2026-06-03T04:00:00.000Z"))),
  ["rams-report-mobile-ux-latest"],
  "RAMS mobile UX report fetch should run on the 3rd at 05:00 Europe/London during BST"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-06-04T01:00:00.000Z"), stateWithHealthAlreadyRun("2026-06-04T01:00:00.000Z"))),
  ["rams-rebuild-seo-aeo-geo"],
  "RAMS SEO/AEO/GEO rebuild should run on the 4th at 02:00 Europe/London during BST"
);

assert.deepEqual(
  ids(dueJobsAt(at("2026-06-04T04:00:00.000Z"), stateWithHealthAlreadyRun("2026-06-04T04:00:00.000Z"))),
  ["rams-report-seo-aeo-geo-latest"],
  "RAMS SEO/AEO/GEO report fetch should run on the 4th at 05:00 Europe/London during BST"
);

const ebookJob = jobs.find((job) => job.id === "oneup-ebooks-weekly");
assert.ok(isTimedJobDue(ebookJob, at("2026-05-04T07:00:00.000Z")), "ebook weekly should run Monday 08:00 Europe/London during BST");
assert.equal(buildPayload(ebookJob, at("2026-05-04T07:00:00.000Z")).weekStartDate, "2026-05-04");

const winterParts = localParts(at("2026-12-07T09:00:00.000Z"), "Europe/London");
assert.equal(winterParts.time, "09:00", "London winter local conversion should stay correct");

const healthDue = dueJobsAt(at("2026-05-04T00:00:00.000Z"), { lastRunKeys: {}, intervalLastRunAt: {} });
assert.ok(healthDue.some((job) => job.id === "suite-health-ping"), "health ping should run when it has no previous timestamp");

console.log("scheduler tests passed");
