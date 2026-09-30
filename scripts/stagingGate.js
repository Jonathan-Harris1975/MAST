#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { baseJobs } from "../src/jobs.js";

function main() {
  const ids = new Set(baseJobs.map((job) => job.id));
  for (const requiredJob of ["suite-health-ping", "rams-health", "hive-repo-health-check"]) {
    if (!ids.has(requiredJob)) throw new Error(`MAST job registry is missing ${requiredJob}`);
  }
  console.log("ok 1 - local MAST governed job registry");

  if (process.argv[2] === "--registry-only" && process.argv.length === 3) {
    console.log("MAST staging registry passed");
    return;
  }
  if (process.argv.length !== 2) throw new Error("Usage: stagingGate.js [--registry-only]");

  const ui = spawnSync(process.execPath, ["scripts/ecosystemSmoke.js"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (ui.status !== 0) throw new Error(`ecosystem smoke failed with exit ${ui.status}`);
  console.log("ok 2 - Worker heartbeat and downstream ecosystem smoke");
  console.log("staging gate passed");
}

try {
  main();
} catch (error) {
  console.error(`staging gate failed: ${error?.message || String(error)}`);
  process.exitCode = 1;
}
