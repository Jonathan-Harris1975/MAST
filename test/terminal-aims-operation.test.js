import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("explicitly settled AIMS failures stop replay without marking success or suppressing tomorrow", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mast-terminal-"));
  process.env.MAST_STATE_BACKEND = "local";
  process.env.STATE_FILE = path.join(temp, "state.json");
  process.env.AIMS_API_KEY = "test-token";
  let posts = 0; let gets = 0; let markedTerminal = true;
  const operation = { id: "2026-10-29:thursday-am", status: "completed-with-failures", failures: 1 };
  const server = http.createServer((req, res) => {
    if (req.method === "POST") posts += 1; else gets += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, ...(markedTerminal ? { terminal: true, retryable: false } : {}), job: operation }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/ops/run/thursday-am`;
  const job = { id: "terminal-operation-test", group: "operations", method: "POST", body: {},
    schedule: { type: "weekly", days: ["thursday", "friday"], time: "10:00", timezone: "Europe/London" },
    url, targetUrl: url, targetPath: "/ops/run/thursday-am", authEnv: "AIMS_API_KEY", requestRetries: 0 };
  try {
    const { runJob } = await import(`../src/scheduler.js?terminal=${Date.now()}`);
    const at = new Date("2026-10-29T10:00:00Z");
    const first = await runJob(job, { at });
    assert.equal(first.ok, false);
    assert.equal(first.operationJob.terminal, true);
    assert.equal(first.operationJob.failures, 1);
    const repeat = await runJob(job, { at });
    assert.equal(repeat.skipped, true);
    assert.equal(posts, 1);
    assert.equal(gets, 0);
    const tomorrow = await runJob(job, { at: new Date("2026-10-30T10:00:00Z") });
    assert.equal(tomorrow.skipped, undefined);
    assert.equal(posts, 2);
    markedTerminal = false;
    const recoverable = { ...job, id: "recoverable-operation-test" };
    assert.equal((await runJob(recoverable, { at })).ok, false);
    assert.equal((await runJob(recoverable, { at })).skipped, undefined);
    assert.equal(posts, 4);
    assert.equal(gets, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
