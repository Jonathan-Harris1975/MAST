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
