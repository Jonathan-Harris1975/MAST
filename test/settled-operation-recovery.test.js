import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("settled failed windows probe at most once a minute and retry only an explicitly recoverable same-day AIMS job", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mast-settled-recovery-"));
  process.env.MAST_STATE_BACKEND = "local";
  process.env.STATE_FILE = path.join(temp, "state.json");
  process.env.AIMS_API_KEY = "test-token";
  process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS = "1";
  const id = "deployment-recovery-test";
  const runKey = `${id}:Europe/London:2026-10-30:10:00`;
  const operationId = "2026-10-30:friday-am";
  const realNow = Date.now; let now = realNow(); Date.now = () => now;
  await writeFile(process.env.STATE_FILE, JSON.stringify({ lastRunKeys: { [id]: runKey }, recentResults: [{
    job: id, group: "operations", runKey, ok: false, operationStatus: "completed-with-failures",
    operationTerminal: true, operationRetryable: false, finishedAt: new Date(now - 120000).toISOString(),
  }] }));
  let posts = 0; let gets = 0; let available = false; let wrongId = false; let failPost = false;
  const server = http.createServer((req, res) => {
    res.writeHead(req.method === "POST" && failPost ? 503 : 200, { "content-type": "application/json" });
    if (req.method === "POST") {
      posts++;
      assert.equal(req.url, "/ops/run/friday-am");
      assert.equal(req.headers["x-operation-force"], undefined);
      res.end(JSON.stringify({ ok: !failPost, job: { id: operationId, status: "accepted" } }));
    } else {
      gets++;
      res.end(JSON.stringify({ ok: true, job: { id: wrongId ? "2026-10-29:thursday-am" : operationId,
        status: posts ? "completed" : "completed-with-failures", failures: posts ? 0 : 1,
        ...(available ? { recoveryAvailable: true } : {}) } }));
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/ops/run/friday-am`;
  const job = { id, group: "operations", method: "POST", body: {}, requestRetries: 0,
    schedule: { type: "weekly", days: ["friday"], time: "10:00", timezone: "Europe/London", catchUpMinutes: 180 },
    url, targetUrl: url, targetPath: "/ops/run/friday-am", authEnv: "AIMS_API_KEY" };
  const { jobs } = await import("../src/jobs.js");
  const originalJobs = jobs.slice();
  jobs.splice(0, jobs.length, job);
  try {
    const { runDueJobs, jobScheduleDue } = await import(`../src/scheduler.js?settledRecovery=${realNow()}`);
    const at = new Date("2026-10-30T20:00:00Z");
    assert.equal(jobScheduleDue(job, at, { lastRunKeys: {}, recentResults: [] }), false,
      "a missed, never-started window must not become a new late run");
    assert.equal((await runDueJobs({ at })).results[0].skipped, true);
    assert.equal((await runDueJobs({ at })).results[0].skipped, true);
    assert.equal(gets, 1); assert.equal(posts, 0);
    available = true; wrongId = true; now += 61000;
    assert.equal((await runDueJobs({ at })).results[0].skipped, true);
    assert.equal(posts, 0);
    wrongId = false; failPost = true; now += 61000;
    assert.equal((await runDueJobs({ at })).ok, false);
    assert.equal(posts, 1); assert.equal(gets, 3);
    failPost = false; now += 61000;
    assert.equal((await runDueJobs({ at })).ok, true);
    assert.equal(posts, 2); assert.equal(gets, 5);
    assert.equal((await runDueJobs({ at })).ran, 0);
    assert.equal(posts, 2); assert.equal(gets, 5);
  } finally {
    Date.now = realNow;
    jobs.splice(0, jobs.length, ...originalJobs);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
