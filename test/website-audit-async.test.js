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

test("MAST waits for the AIMS website audit terminal status before succeeding", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mast-audit-test-"));
  let polls = 0;
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/audits/website/run") {
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, sessionId: "website-test", job: { status: "running" } }));
      return;
    }
    if (req.method === "GET" && req.url === "/audits/website/jobs/website-test") {
      polls += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, job: { status: polls >= 2 ? "completed" : "running" } }));
      return;
    }
    res.writeHead(404).end();
  });

  await listen(server);
  const { port } = server.address();
  process.env.MAST_STATE_BACKEND = "local";
  process.env.STATE_FILE = path.join(tempDir, "state.json");
  process.env.AIMS_API_KEY = "test-key";
  process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS = "5";
  process.env.MAST_AIMS_OPERATION_TIMEOUT_MS = "5000";
  const { runJob } = await import(`../src/scheduler.js?audit-test=${Date.now()}`);

  const job = {
    id: "website-audit-pipeline-test",
    group: "audits",
    description: "test",
    method: "POST",
    schedule: { type: "manual" },
    url: `http://127.0.0.1:${port}/audits/website/run`,
    targetUrl: `http://127.0.0.1:${port}/audits/website/run`,
    targetPath: "/audits/website/run",
    body: {},
    authEnv: "AIMS_API_KEY",
    asyncStatus: {
      responseIdField: "sessionId",
      statusPath: "/audits/website/jobs/{id}",
      statusField: "job.status",
      successStatuses: ["completed"],
      pendingStatuses: ["queued", "accepted", "running"],
      failureStatuses: ["failed"],
    },
  };

  try {
    const result = await runJob(job, { force: true, trigger: "test" });
    assert.equal(result.ok, true);
    assert.equal(result.asyncJob.status, "completed");
    assert.equal(result.asyncJob.asyncId, "website-test");
    assert.ok(polls >= 2);
  } finally {
    await close(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});
