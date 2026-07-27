import assert from "node:assert/strict";
import test from "node:test";
import { baseJobs, jobs, pretriggerJobs } from "../src/jobs.js";

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

test("legacy task-level content jobs remain manual fallbacks and cannot double-fire", () => {
  for (const id of legacyContentIds) {
    const job = baseJobs.find((item) => item.id === id);
    assert.ok(job, `${id} should remain available for manual recovery`);
    assert.equal(job.schedule.type, "manual", `${id} must not retain an independent schedule`);
    assert.equal(job.hookEnv, null, `${id} must use the direct app endpoint rather than Hookdeck`);
  }
});

test("Friday PM is the extended weekend handoff window", () => {
  const job = baseJobs.find((item) => item.id === "operation-friday-pm");
  assert.deepEqual(job.schedule.days, ["friday"]);
  assert.equal(job.targetPath, "/ops/run/friday-pm");
  assert.match(job.description, /podcast/i);
  assert.match(job.description, /Saturday\/Sunday Zernio/i);
});

test("operation windows do not multiply into per-task pretriggers", () => {
  assert.equal(pretriggerJobs.some((job) => operationIds.includes(job.sourceJobId)), false);
  assert.equal(jobs.filter((job) => job.group === "operations").length, 10);
});

test("HIVE and RAMS governance schedules remain present", () => {
  assert.ok(baseJobs.some((job) => job.id === "hive-readiness-check"));
  assert.ok(baseJobs.some((job) => job.id === "rams-readiness"));
  assert.ok(baseJobs.some((job) => job.id === "website-audit-pipeline"));
});
