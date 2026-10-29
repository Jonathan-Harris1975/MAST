import test from 'node:test';
import assert from 'node:assert/strict';
import { baseJobs } from '../src/jobs.js';
import { isTimedJobDue } from '../src/scheduler.js';

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
