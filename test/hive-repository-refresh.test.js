import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const EXPECTED_REPOSITORIES = [
  "HIVE", "HIVE-UI", "AIMS", "AIMS-UI", "RAMS", "MAST", "IRS", "Website",
];

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function waitUntil(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("condition was not reached before timeout");
}

function completedPayload(repositoryIds = EXPECTED_REPOSITORIES) {
  return {
    job_id: "refresh-123",
    status: "completed",
    ok: true,
    repository_count: repositoryIds.length,
    completed_count: repositoryIds.length,
    failed_count: 0,
    results: repositoryIds.map((repository_id) => ({ repository_id, ok: true })),
  };
}

test("MAST waits for HIVE refresh completion, validates all eight repositories, and blocks overlap", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mast-hive-refresh-"));
  let postCalls = 0;
  let statusCalls = 0;
  let releaseTerminal;
  const terminalGate = new Promise((resolve) => { releaseTerminal = resolve; });

  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/v1/repositories/refresh-all") {
      postCalls += 1;
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ job_id: "refresh-123", status: "accepted" }));
      return;
    }
    if (req.method === "GET" && req.url === "/v1/repositories/refresh-jobs/refresh-123") {
      statusCalls += 1;
      if (statusCalls === 1) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ job_id: "refresh-123", status: "running" }));
        return;
      }
      await terminalGate;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(completedPayload()));
      return;
    }
    res.writeHead(404).end();
  });

  await listen(server);
  const { port } = server.address();
  process.env.MAST_STATE_BACKEND = "local";
  process.env.STATE_FILE = path.join(tempDir, "state.json");
  process.env.HIVE_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.HIVE_ADMIN_BEARER_TOKEN = "test-token";
  process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS = "10";
  process.env.MAST_AIMS_OPERATION_TIMEOUT_MS = "2000";
  process.env.REQUEST_TIMEOUT_MS = "1000";

  const { baseJobs, HIVE_GOVERNED_REPOSITORIES } = await import(`../src/jobs.js?hive-refresh=${Date.now()}`);
  const { runJob } = await import(`../src/scheduler.js?hive-refresh=${Date.now()}`);
  const job = baseJobs.find((item) => item.id === "hive-repositories-monthly-refresh");

  try {
    assert.deepEqual(HIVE_GOVERNED_REPOSITORIES, EXPECTED_REPOSITORIES);
    const firstPromise = runJob(job, { at: new Date("2026-09-12T08:30:00.000Z"), trigger: "test", force: true });
    await waitUntil(() => postCalls === 1 && statusCalls >= 1);

    const overlapping = await runJob(job, { at: new Date("2026-09-12T08:30:00.000Z"), trigger: "test-overlap", force: true });
    assert.equal(overlapping.skipped, true);
    assert.equal(overlapping.reason, "job-already-running");
    assert.equal(postCalls, 1, "overlapping scheduler execution must not start a second estate refresh");

    releaseTerminal();
    const first = await firstPromise;
    assert.equal(first.ok, true);
    assert.equal(first.status, 202);
    assert.equal(first.asyncJob.status, "completed");
    assert.equal(first.asyncJob.terminalResponsePolicy.ok, true);
    assert.equal(first.asyncJob.repository_count, 8);
    assert.equal(first.asyncJob.completed_count, 8);
    assert.equal(first.asyncJob.failed_count, 0);
  } finally {
    releaseTerminal?.();
    await close(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MAST fails closed when HIVE reports completed but omits a governed repository", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mast-hive-refresh-partial-"));
  let postCalls = 0;
  const partialRepositories = EXPECTED_REPOSITORIES.filter((id) => id !== "Website");
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/repositories/refresh-all") {
      postCalls += 1;
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ job_id: "refresh-123", status: "accepted" }));
      return;
    }
    if (req.method === "GET" && req.url === "/v1/repositories/refresh-jobs/refresh-123") {
      const payload = completedPayload(partialRepositories);
      // Simulate an upstream defect that incorrectly labels a seven-repository run completed.
      payload.repository_count = 7;
      payload.completed_count = 7;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
      return;
    }
    res.writeHead(404).end();
  });

  await listen(server);
  const { port } = server.address();
  process.env.MAST_STATE_BACKEND = "local";
  process.env.STATE_FILE = path.join(tempDir, "state.json");
  process.env.HIVE_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.HIVE_ADMIN_BEARER_TOKEN = "test-token";
  process.env.MAST_AIMS_OPERATION_POLL_INTERVAL_MS = "10";
  process.env.MAST_AIMS_OPERATION_TIMEOUT_MS = "2000";
  process.env.REQUEST_TIMEOUT_MS = "1000";

  const { baseJobs } = await import(`../src/jobs.js?hive-partial=${Date.now()}`);
  const { runJob } = await import(`../src/scheduler.js?hive-partial=${Date.now()}`);
  const job = baseJobs.find((item) => item.id === "hive-repositories-monthly-refresh");

  try {
    const at = new Date("2026-09-12T08:30:00.000Z");
    const first = await runJob(job, { at, trigger: "test", force: false });
    assert.equal(first.ok, false);
    assert.equal(first.asyncFailure.status, "completed");
    assert.match(first.asyncFailure.error, /all eight governed repositories/i);
    assert.equal(first.asyncFailure.responsePolicy.ok, false);

    const second = await runJob(job, { at, trigger: "test", force: false });
    assert.equal(second.skipped, true);
    assert.equal(second.reason, "already-ran-for-this-schedule-window");
    assert.equal(postCalls, 1, "failed terminal validation must consume the expensive monthly refresh window");
  } finally {
    await close(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});
