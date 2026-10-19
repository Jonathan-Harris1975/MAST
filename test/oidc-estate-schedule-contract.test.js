import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = new URL("../.github/workflows/oidc-estate-readiness.yml", import.meta.url);

test("MAST refreshes exact-main OIDC estate evidence daily", async () => {
  const source = await readFile(workflow, "utf8");
  const schedule = source.split("schedule:")[1].split("workflow_dispatch:")[0];
  assert.match(schedule, /cron: '17 2 \* \* \*'/);
});

test("estate readiness rejects repositories whose current-main workflow omits exact workflow identity checks", async () => {
  const source = await readFile(workflow, "utf8");
  assert.match(source, /contents\/\.github\/workflows\/oidc-readiness\.yml\?ref=\$\{sha\}/);
  assert.match(source, /workflowBindingPresent/);
  assert.match(source, /canonical exact workflow_ref claim/);
  assert.match(source, /workflow_binding_verified: true/);
  assert.match(source, /no cloud provider trust is verified/);
});
