import test from 'node:test';
import assert from 'node:assert/strict';
import { baseJobs } from '../src/jobs.js';
import { buildPayload, isTimedJobDue } from '../src/scheduler.js';

test('weekend newsletter jobs only send Friday-prepared issues in the London maintenance gaps', () => {
  const jobs = baseJobs.filter(j => /^newsletter-ai-edge-(saturday|sunday)-send$/.test(j.id));
  assert.equal(jobs.length, 2);
  for (const job of jobs) {
    const day = job.schedule.days[0];
    assert.equal(job.schedule.timezone, 'Europe/London');
    assert.equal(job.schedule.time, day === 'saturday' ? '17:10' : '05:10');
    assert.equal(job.schedule.catchUpMinutes, 30);
    assert.equal(job.targetPath, `/newsletter/weekend/send/${day}`);
    assert.equal(job.requestRetries, 0);
    assert.deepEqual(job.requiredServices, ['aims']);
    const [hour, minute] = job.schedule.time.split(':').map(Number);
    const minutes = hour * 60 + minute;
    // Estate allocations: Saturday CI 00:00-16:00, Sunday councils 06:00-24:00.
    assert.ok(day === 'saturday' ? minutes > 16 * 60 && minutes + 30 < 18 * 60 : minutes > 5 * 60 && minutes + 30 < 6 * 60);
    // Monthly DAST starts: Sat IRS 16:17, RAMS 18:00, AIMS-UI 20:00;
    // Sun website 01:00, HIVE 02:21, HIVE-UI 04:00 (15-minute scan jobs).
    const scans = day === 'saturday' ? [16 * 60 + 17, 18 * 60, 20 * 60] : [60, 2 * 60 + 21, 4 * 60];
    for (const scan of scans) assert.ok(minutes >= scan + 15 || minutes + 30 < scan);
  }
});

test('weekend social blogs use the normal quality pipeline and a DST-aware London publication date', () => {
  const jobs = baseJobs.filter(j => /^blog-social-(saturday|sunday)$/.test(j.id));
  assert.equal(jobs.length, 2);
  for (const job of jobs) {
    const day = job.schedule.days[0];
    assert.equal(job.schedule.timezone, 'Europe/London');
    assert.equal(job.schedule.time, '08:00');
    assert.equal(job.schedule.catchUpMinutes, 120);
    assert.deepEqual(job.requiredServices, ['aims']);
    assert.equal(job.targetPath, '/blog/social/daily/build');
    assert.equal(job.requestRetries, 0);
    assert.equal(job.localDateField, 'date');
    assert.deepEqual(job.asyncStatus, {
      responseIdField: 'sessionId',
      statusPath: '/blog/social/jobs/daily-build/{id}',
      statusField: 'status',
      terminalResponsePolicy: { checks: [{
        type: 'equals', path: 'result.ok', value: true,
        message: 'Weekend social blog did not pass its publication and quality gates.',
      }] },
    });
    assert.equal(isTimedJobDue(job, new Date(day === 'saturday'
      ? '2026-11-28T08:00:00Z' : '2026-11-29T08:00:00Z')), true);
    assert.equal(isTimedJobDue(job, new Date(day === 'saturday'
      ? '2026-11-27T08:00:00Z' : '2026-11-30T08:00:00Z')), false);
  }
  const saturday = jobs.find(j => j.id === 'blog-social-saturday');
  assert.equal(buildPayload(saturday, new Date('2026-06-27T07:00:00Z')).date, '2026-06-27',
    'the publication date must follow London wall time during BST');
});
