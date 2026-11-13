import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { baseJobs } from "../src/jobs.js";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}
function close(server) {
  server.closeAllConnections();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("whole-operation backstop waits for a real child result and never double-dispatches", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mast-content-backstop-"));
  const oldBackend = process.env.MAST_STATE_BACKEND;
  const oldPath = process.env.STATE_FILE;
  const oldKey = process.env.AIMS_API_KEY;
  const oldPoll = process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS;
  let posts = 0, gets = 0, failed = false;
  const operationId = "2026-11-13:friday-am";
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST") {
      posts += 1;
      assert.equal(req.url, "/ops/run/friday-am");
      assert.equal(req.headers["x-operation-force"], undefined);
      res.end(JSON.stringify({ ok: true, job: { id: operationId, status: "accepted" } }));
      return;
    }
    gets += 1;
    assert.equal(req.url, `/ops/jobs/${encodeURIComponent(operationId)}`);
    res.end(JSON.stringify({ ok: true, job: {
      id: operationId, status: failed ? "completed-with-failures" : "completed",
      failures: failed ? 1 : 0,
      results: failed ? [{ name: "newsletter-send", ok: false }] : [{ name: "newsletter-send", ok: true }],
    } }));
  });
  await listen(server);
  try {
    process.env.MAST_STATE_BACKEND = "local";
    process.env.STATE_FILE = path.join(temp, "state.json");
    process.env.AIMS_API_KEY = "test-token";
    process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS = "1";
    const { runJob } = await import(`../src/scheduler.js?content-backstop=${Date.now()}`);
    const base = baseJobs.find((item) => item.id === "operation-friday-am-afternoon-backstop");
    assert.ok(base);
    const job = { ...base, url: `http://127.0.0.1:${server.address().port}/ops/run/friday-am` };
    const at = new Date("2026-11-13T15:45:00.000Z");
    const first = await runJob(job, { at, trigger: "regression" });
    assert.equal(first.ok, true);
    assert.equal(first.operationJob.status, "completed");
    assert.equal(posts, 1); assert.equal(gets, 1);
    const repeated = await runJob(job, { at, trigger: "regression" });
    assert.equal(repeated.skipped, true);
    assert.equal(posts, 1, "already-settled recovery must not re-POST");

    failed = true;
    const lateJob = { ...job, id: "operation-friday-am-evening-backstop" };
    const late = await runJob(lateJob, { at: new Date("2026-11-13T21:20:00.000Z"), trigger: "regression" });
    assert.equal(late.ok, false);
    assert.equal(late.operationFailure.status, "completed-with-failures");
    assert.equal(posts, 2);
    const repeatedFailure = await runJob(lateJob, { at: new Date("2026-11-13T21:20:00.000Z"), trigger: "regression" });
    assert.equal(repeatedFailure.skipped, true, "a failing backstop must not hammer the provider on each tick");
    assert.equal(posts, 2);
  } finally {
    if (oldBackend === undefined) delete process.env.MAST_STATE_BACKEND;
    else process.env.MAST_STATE_BACKEND = oldBackend;
    if (oldPath === undefined) delete process.env.STATE_FILE;
    else process.env.STATE_FILE = oldPath;
    if (oldKey === undefined) delete process.env.AIMS_API_KEY;
    else process.env.AIMS_API_KEY = oldKey;
    if (oldPoll === undefined) delete process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS;
    else process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS = oldPoll;
    await close(server);
    await rm(temp, { recursive: true, force: true });
  }
});

test("failed provider POSTs are not immediately replayed and 2xx JSON failures are not marked done", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mast-ack-failure-"));
  const originalBackend = process.env.MAST_STATE_BACKEND;
  const originalFile = process.env.STATE_FILE;
  const originalKey = process.env.AIMS_API_KEY;
  let calls = 0;
  let semanticFailure = false;
  const server = http.createServer((_req, res) => {
    calls += 1;
    res.writeHead(semanticFailure ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(semanticFailure ? { ok: false, error: "provider rejected content" }
      : { ok: false, error: "temporarily unavailable" }));
  });
  await listen(server);
  try {
    process.env.MAST_STATE_BACKEND = "local";
    process.env.STATE_FILE = path.join(temp, "state.json");
    process.env.AIMS_API_KEY = "test-token";
    const { runJob } = await import(`../src/scheduler.js?provider-failure=${Date.now()}`);
    const job = { id: "provider-batch-test", group: "outreach", method: "POST",
      schedule: { type: "weekly", days: ["friday"], time: "16:00",
        timezone: "Europe/London", catchUpMinutes: 120 },
      url: `http://127.0.0.1:${server.address().port}/outreach/batch/next`,
      targetPath: "/outreach/batch/next",
      authEnv: "AIMS_API_KEY",
      body: {},
    };
    const first = await runJob(job, { at: new Date("2026-11-13T16:00:00Z") });
    assert.equal(first.ok, false);
    assert.equal(calls, 1, "ambiguous non-idempotent POST must not retry automatically");
    semanticFailure = true;
    const next = await runJob({ ...job, id: "provider-batch-semantic-test" },
      { at: new Date("2026-11-13T16:00:00Z") });
    assert.equal(next.ok, false);
    assert.equal(next.status, 200);
    assert.equal(next.providerReportedFailure, true);
    assert.equal(calls, 2);
  } finally {
    if (originalBackend === undefined) delete process.env.MAST_STATE_BACKEND;
    else process.env.MAST_STATE_BACKEND = originalBackend;
    if (originalFile === undefined) delete process.env.STATE_FILE;
    else process.env.STATE_FILE = originalFile;
    if (originalKey === undefined) delete process.env.AIMS_API_KEY;
    else process.env.AIMS_API_KEY = originalKey;
    await close(server);
    await rm(temp, { recursive: true, force: true });
  }
});

test("an active multi-hour content operation cannot starve other due scheduler jobs", async () => {
  const { jobs } = await import("../src/jobs.js");
  const oldJobs = jobs.slice();
  const temp = await mkdtemp(path.join(os.tmpdir(), "mast-nonblocking-"));
  const old = {
    backend: process.env.MAST_STATE_BACKEND,
    file: process.env.STATE_FILE,
    token: process.env.AIMS_API_KEY,
    interval: process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS,
    timeout: process.env.MAST_AIMS_OPERATION_TIMEOUT_MS,
    between: process.env.BETWEEN_JOBS_MS,
  };
  let settled = false, operationPosts = 0, independentPosts = 0, polls = 0;
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/ops/run/friday-am") {
      operationPosts += 1;
      res.end(JSON.stringify({ ok: true, job: { id: "2026-11-13:friday-am", status: "accepted" } }));
    } else if (req.method === "GET" && req.url === "/ops/jobs/2026-11-13%3Afriday-am") {
      polls += 1;
      res.end(JSON.stringify({ ok: true, job: {
        id: "2026-11-13:friday-am", status: settled ? "completed" : "running",
        failures: 0, results: settled ? [{ name: "newsletter-send", ok: true }] : [],
      } }));
    } else if (req.method === "POST" && req.url === "/outreach/batch/next") {
      independentPosts += 1;
      res.end(JSON.stringify({ ok: true, processed: 1 }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: "unexpected-route", path: req.url }));
    }
  });
  await listen(server);
  try {
    process.env.MAST_STATE_BACKEND = "local";
    process.env.STATE_FILE = path.join(temp, "state.json");
    process.env.AIMS_API_KEY = "test-token";
    process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS = "10";
    process.env.MAST_AIMS_OPERATION_TIMEOUT_MS = "3000";
    process.env.BETWEEN_JOBS_MS = "1";
    const origin = `http://127.0.0.1:${server.address().port}`;
    const schedule = { type: "weekly", days: ["friday"], time: "10:00",
      timezone: "Europe/London", catchUpMinutes: 120 };
    jobs.splice(0, jobs.length,
      { id: "nonblocking-operation", group: "operations", method: "POST",
        schedule, url: `${origin}/ops/run/friday-am`, targetPath: "/ops/run/friday-am",
        authEnv: "AIMS_API_KEY", requiredServices: [], body: {}, requestRetries: 0,
        nonBlocking: true },
      { id: "independent-queued-job", group: "outreach", method: "POST",
        schedule, url: `${origin}/outreach/batch/next`, targetPath: "/outreach/batch/next",
        authEnv: "AIMS_API_KEY", requiredServices: [], body: {}, requestRetries: 0,
        nonBlocking: false },
    );
    const { runDueJobs, getStatus } = await import(`../src/scheduler.js?nonblocking=${Date.now()}`);
    const at = new Date("2026-11-13T10:00:00.000Z");
    const first = await Promise.race([
      runDueJobs({ at, trigger: "test" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("scheduler tick blocked by operation poll")), 3000)),
    ]);
    assert.equal(first.ran, 2);
    assert.equal(first.results[0].pending, true);
    assert.equal(first.results[0].settled, false);
    assert.equal(operationPosts, 1);
    assert.equal(independentPosts, 1, "next job must execute while operation is still pending");
    settled = true;
    let confirmed = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const status = await getStatus();
      if (status.state?.recentResults?.some((entry) =>
          entry.job === "nonblocking-operation" && entry.ok === true)) {
        confirmed = true;
        break;
      }
    }
    assert.equal(confirmed, true, "background monitor must persist verified terminal success");
    assert.ok(polls >= 1);
  } finally {
    jobs.splice(0, jobs.length, ...oldJobs);
    for (const [key, field] of [
      ["MAST_STATE_BACKEND", "backend"], ["STATE_FILE", "file"],
      ["AIMS_API_KEY", "token"], ["MAST_AIMS_OPERATION_POLL_INTERVAL_MS", "interval"],
      ["MAST_AIMS_OPERATION_TIMEOUT_MS", "timeout"],
      ["BETWEEN_JOBS_MS", "between"],
    ]) {
      if (old[field] === undefined) delete process.env[key];
      else process.env[key] = old[field];
    }
    await close(server);
    await rm(temp, { recursive: true, force: true });
  }
});
