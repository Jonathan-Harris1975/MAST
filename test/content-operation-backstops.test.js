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
