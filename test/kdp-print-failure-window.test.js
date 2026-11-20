import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("a malformed or missing KDP async response never re-POSTs the same publishing window", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mast-kdp-print-failure-"));
  let calls = 0;
  const server = http.createServer((_req, res) => {
    calls++;
    res.writeHead(202, { "content-type": "application/json" });
    res.end(calls === 1 ? JSON.stringify({ accepted: true }) : "{malformed-json");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const previous = {
    backend: process.env.MAST_STATE_BACKEND,
    path: process.env.STATE_FILE,
  };
  try {
    process.env.MAST_STATE_BACKEND = "local";
    process.env.STATE_FILE = path.join(dir, "scheduler-state.json");
    const { runJob } = await import(`../src/scheduler.js?print-no-replay=${Date.now()}`);
    const url = `http://127.0.0.1:${address.port}/kdp/print/production/run`;
    const job = {
      id: "kdp-print-production-test",
      group: "kdp", description: "Bounded KDP print publication",
      method: "POST", url, targetUrl: url,
      targetPath: "/kdp/print/production/run", body: {},
      schedule: { type: "weekly", days: ["monday","tuesday","wednesday","thursday"],
        time: "16:10", timezone: "Europe/London", catchUpMinutes: 20 },
      requiredServices: [], requestRetries: 0, consumeFailureWindow: true,
      asyncStatus: {
        responseIdField: "sessionId",
        statusPath: "/kdp/jobs/print-production/{id}",
        statusField: "status",
      },
    };
    const monday = new Date("2026-11-23T16:10:00Z");
    const tuesday = new Date("2026-11-24T16:10:00Z");
    const first = await runJob(job, { at: monday, trigger: "test" });
    assert.equal(first.ok, false);
    assert.match(first.errorMessage, /omitted sessionId/);
    const sameMonday = await runJob(job, { at: monday, trigger: "test" });
    assert.equal(sameMonday.skipped, true);
    assert.equal(sameMonday.reason, "already-ran-for-this-schedule-window");
    assert.equal(calls, 1, "a possible KDP submission must never be blindly replayed");

    const nextDay = await runJob(job, { at: tuesday, trigger: "test" });
    assert.equal(nextDay.ok, false);
    assert.match(nextDay.errorMessage, /not valid JSON/);
    const sameTuesday = await runJob(job, { at: tuesday, trigger: "test" });
    assert.equal(sameTuesday.skipped, true);
    assert.equal(calls, 2, "a new weekday is a distinct governed recovery window");
  } finally {
    if (previous.backend === undefined) delete process.env.MAST_STATE_BACKEND;
    else process.env.MAST_STATE_BACKEND = previous.backend;
    if (previous.path === undefined) delete process.env.STATE_FILE;
    else process.env.STATE_FILE = previous.path;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
