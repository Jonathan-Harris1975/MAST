import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

function runStateLoad(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", "import('./src/scheduler.js').then(m => m.loadState()).then(() => process.exit(0)).catch(() => process.exit(23))"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stderr }));
  });
}

test("R2 state load fails closed on transport errors instead of hydrating an empty ledger", async () => {
  const result = await runStateLoad({
    APP_ENV: "production",
    MAST_STATE_BACKEND: "r2",
    R2_ENDPOINT_URL: "http://127.0.0.1:9",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    R2_BUCKET_META_SYSTEM: "test-meta-system",
    R2_MAX_ATTEMPTS: "1",
  });

  assert.equal(result.code, 23, result.stderr);
  assert.match(result.stderr, /state-load-failed/);
  assert.doesNotMatch(result.stderr, /state-load-fallback/);
});
