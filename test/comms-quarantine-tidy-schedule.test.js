import test from 'node:test';
import assert from 'node:assert/strict';
import { baseJobs, pretriggerJobs } from '../src/jobs.js';
import { isTimedJobDue, nextRunForJob, jobScheduleDue, buildRunKey } from '../src/scheduler.js';
import { evaluateResponsePolicy } from '../src/response-policy.js';

const job = baseJobs.find((item) => item.id === 'comms-hub-weekly-quarantine-tidy');

test('native Comms Hub tidy runs Monday at 08:00 UK time across GMT and BST', () => {
  assert.ok(job);
  assert.equal(job.schedule.time, process.env.MAST_COMMS_QUARANTINE_TIDY_TIME || '08:00');
  assert.equal(job.schedule.timezone, 'Europe/London');
  assert.deepEqual(job.schedule.days, ['monday']);
  assert.equal(nextRunForJob(job, new Date('2026-11-12T21:00:00Z')), '2026-11-16T08:00:00.000Z');
  assert.equal(nextRunForJob(job, new Date('2026-07-10T12:00:00Z')), '2026-07-13T07:00:00.000Z');
  assert.equal(isTimedJobDue(job, new Date('2026-11-16T07:59:59Z')), false);
  assert.equal(isTimedJobDue(job, new Date('2026-11-16T08:00:00Z')), true);
  assert.equal(isTimedJobDue(job, new Date('2026-07-13T07:00:00Z')), true);
  assert.equal(isTimedJobDue(job, new Date('2026-11-15T08:00:00Z')), false);
  assert.equal(isTimedJobDue(job, new Date('2026-11-17T08:00:00Z')), false);
});

test('tidy uses authenticated AIMS maintenance with bounded retries and strict applied-result checks', () => {
  assert.equal(job.targetPath, '/comms-hub/maintenance/quarantine-tidy');
  assert.equal(job.authEnv, 'AIMS_API_KEY');
  assert.deepEqual(job.body, { dryRun: false });
  assert.deepEqual(job.requiredServices, ['aims']);
  assert.equal(job.requestRetries, 2);
  assert.equal(job.consumeFailureWindow, true);
  const result = { ok: true, result: { dryRun: false, limit: 500, cleared: 5, retained: 2, purged: { items: 0 } } };
  assert.equal(evaluateResponsePolicy(job.responsePolicy, JSON.stringify(result)).ok, true);
  for (const bad of [{ ok: true }, { ...result, ok: false }, { ...result, result: { ...result.result, dryRun: true } }]) {
    assert.equal(evaluateResponsePolicy(job.responsePolicy, JSON.stringify(bad)).ok, false);
  }
  assert.equal(evaluateResponsePolicy(job.responsePolicy, 'not-json').ok, false);
  assert.equal(pretriggerJobs.filter((item) => item.sourceJobId === job.id).length, 3);
});


test('native durable run keys suppress duplicate tidy work and bound catch-up', () => {
  const at = new Date('2026-11-16T08:00:00Z');
  const state = { lastRunKeys: {}, intervalLastRunAt: {}, recentResults: [] };
  assert.equal(jobScheduleDue(job, at, state), true);
  state.lastRunKeys[job.id] = buildRunKey(job, at, state);
  assert.equal(jobScheduleDue(job, new Date('2026-11-16T09:00:00Z'), state), false);
  assert.equal(jobScheduleDue(job, new Date('2026-11-23T08:00:00Z'), state), true);
  assert.equal(isTimedJobDue(job, new Date('2026-11-16T19:59:00Z')), true);
  assert.equal(isTimedJobDue(job, new Date('2026-11-16T20:00:00Z')), false);
});
