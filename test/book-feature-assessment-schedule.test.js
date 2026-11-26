import test from "node:test";
import assert from "node:assert/strict";

test("Book Feature assessment is registered separately and inactive until its deployment switch is enabled", async () => {
  const previous = process.env.MAST_BOOK_FEATURE_ASSESSMENT_ENABLED;
  process.env.MAST_BOOK_FEATURE_ASSESSMENT_ENABLED = "false";
  const { baseJobs } = await import(`../src/jobs.js?book-feature-default-${Date.now()}`);
  if (previous === undefined) delete process.env.MAST_BOOK_FEATURE_ASSESSMENT_ENABLED;
  else process.env.MAST_BOOK_FEATURE_ASSESSMENT_ENABLED = previous;
  const job = baseJobs.find((item) => item.id === "book-feature-outreach-assessment");
  assert.ok(job);
  assert.equal(job.group, "book-feature-outreach");
  assert.equal(job.targetPath, "/outreach/book-feature/run");
  assert.equal(job.schedule.type, "manual");
  assert.equal(job.asyncStatus.statusPath, "/outreach/book-feature/jobs/run/{id}");
  assert.equal(job.asyncStatus.terminalResponsePolicy.checks[1].value, 0);
});

test("enabled Book Feature uses the Europe/London Tuesday and Thursday 09:00 clock", async () => {
  const previous = process.env.MAST_BOOK_FEATURE_ASSESSMENT_ENABLED;
  process.env.MAST_BOOK_FEATURE_ASSESSMENT_ENABLED = "true";
  try {
    const { baseJobs: enabledJobs } = await import(`../src/jobs.js?book-feature-schedule-${Date.now()}`);
    const job = enabledJobs.find((item) => item.id === "book-feature-outreach-assessment");
    assert.deepEqual(job.schedule, { type: "weekly", days: ["tuesday", "thursday"],
      time: "09:00", timezone: "Europe/London", catchUpMinutes: 120 });
  } finally {
    if (previous === undefined) delete process.env.MAST_BOOK_FEATURE_ASSESSMENT_ENABLED;
    else process.env.MAST_BOOK_FEATURE_ASSESSMENT_ENABLED = previous;
  }
});
