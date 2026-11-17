import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("MAST defers distinct heavy jobs on the same execution lane while independent services run", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mast-lane-"));
  const previousBackend = process.env.MAST_STATE_BACKEND;
  const previousFile = process.env.STATE_FILE;
  process.env.MAST_STATE_BACKEND = "local";
  process.env.STATE_FILE = path.join(temp, "state.json");
  let releaseSlow, notifyStarted;
  const entered = new Promise(resolve => { notifyStarted = resolve; });
  let slowRequests = 0, fastRequests = 0;
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/slow") {
      slowRequests++;
      releaseSlow = () => res.end(JSON.stringify({ ok: true }));
      notifyStarted();
    } else {
      fastRequests++;
      res.end(JSON.stringify({ ok: true }));
    }
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { runJob } = await import(`../src/scheduler.js?execution-lane=${Date.now()}`);
    const host = `http://127.0.0.1:${server.address().port}`;
    const schedule = { type: "manual" };
    const create = (id, lane, endpoint) => ({
      id, group: "test", method: "GET", schedule,
      url: host + endpoint, targetPath: endpoint, requiredServices: [],
      requestRetries: 0, executionLane: lane,
    });
    const date = new Date("2026-11-17T12:00:00Z");
    const active = runJob(create("heavy-a", "aims-heavy", "/slow"), { at: date, force: true });
    await entered;
    const blocked = await runJob(create("heavy-b", "aims-heavy", "/fast"), { at: date, force: true });
    assert.equal(blocked.skipped, true);
    assert.equal(blocked.pending, true);
    assert.equal(blocked.reason, "execution-lane-busy");
    assert.equal(blocked.activeJob, "heavy-a");
    assert.equal(fastRequests, 0, "blocked work must make no network request");
    const independent = await runJob(create("hive-check", null, "/fast"), { at: date, force: true });
    assert.equal(independent.ok, true);
    assert.equal(fastRequests, 1);
    releaseSlow();
    releaseSlow = null;
    const first = await active;
    assert.equal(first.ok, true);
    const afterRelease = await runJob(create("heavy-b", "aims-heavy", "/fast"), { at: date, force: true });
    assert.equal(afterRelease.ok, true);
    assert.equal(fastRequests, 2);
    assert.equal(slowRequests, 1);
  } finally {
    if (releaseSlow) releaseSlow();
    await new Promise(resolve => server.close(resolve));
    if (previousBackend === undefined) delete process.env.MAST_STATE_BACKEND;
    else process.env.MAST_STATE_BACKEND = previousBackend;
    if (previousFile === undefined) delete process.env.STATE_FILE;
    else process.env.STATE_FILE = previousFile;
    await rm(temp, { recursive: true, force: true });
  }
});

test("every weekday heavy primary launch gets an explicit lane and no same-minute collision", async () => {
  const { baseJobs } = await import("../src/jobs.js");
  const weekdayNames = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  for (const day of weekdayNames) {
    const regular = baseJobs.filter(job =>
      job.executionLane === "aims-heavy" && job.schedule?.type === "weekly" &&
      job.schedule.days?.includes(day));
    const byTime = new Map();
    for (const job of regular) {
      const key = job.schedule.time;
      assert.equal(byTime.has(key), false,
        `same-minute heavy work ${day} ${key}: ${byTime.get(key)} and ${job.id}`);
      byTime.set(key, job.id);
    }
  }
  const am = baseJobs.find(j => j.id === "blotato-weekday-am-backstop");
  const friday = baseJobs.find(j => j.id === "blotato-friday-am-backstop");
  assert.equal(am.schedule.days.includes("friday"), false);
  assert.deepEqual(friday.schedule.days, ["friday"]);
  const audits = baseJobs.filter(j => ["website-audit-pipeline", "aims-audit-pipeline"].includes(j.id));
  for (const j of audits) {
    assert.equal(j.executionLane, "aims-heavy");
    assert.equal(j.schedule.time, "19:30");
  }
});
