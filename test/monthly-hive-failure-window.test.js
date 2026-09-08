import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("failed monthly HIVE POST is not replayed every scheduler tick", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mast-hive-monthly-"));
  let calls = 0;
  const server = http.createServer((_req, res) => {
    calls += 1;
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "no qualified models" }));
  });
  await listen(server);
  const { port } = server.address();

  process.env.MAST_STATE_BACKEND = "local";
  process.env.STATE_FILE = path.join(tempDir, "state.json");
  process.env.HIVE_ADMIN_BEARER_TOKEN = "test-token";
  const { runJob } = await import(`../src/scheduler.js?hive-monthly=${Date.now()}`);

  const at = new Date("2026-09-01T06:00:00.000Z");
  const job = {
    id: "hive-ai-council-test",
    group: "hive-ai-council",
    description: "test",
    method: "POST",
    schedule: {
      type: "monthly",
      dayOfMonth: 1,
      time: "07:00",
      timezone: "Europe/London",
      catchUpMinutes: 1020,
    },
    url: `http://127.0.0.1:${port}/v1/ai-council/run`,
    targetUrl: `http://127.0.0.1:${port}/v1/ai-council/run`,
    targetPath: "/v1/ai-council/run",
    body: {},
    authEnv: "HIVE_ADMIN_BEARER_TOKEN",
    requestRetries: 0,
    consumeFailureWindow: true,
  };

  try {
    const first = await runJob(job, { at, trigger: "test" });
    const second = await runJob(job, { at, trigger: "test" });

    assert.equal(first.ok, false);
    assert.equal(first.status, 503);
    assert.equal(second.skipped, true);
    assert.equal(second.reason, "already-ran-for-this-schedule-window");
    assert.equal(calls, 1, "the failed Council POST should only be sent once");
  } finally {
    await close(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});
