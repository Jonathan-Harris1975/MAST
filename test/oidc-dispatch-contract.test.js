import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = new URL("../.github/workflows/oidc-readiness.yml", import.meta.url);

test("MAST refreshes estate OIDC evidence without relying on a checked-out git repository", async () => {
  const source = await readFile(workflow, "utf8");
  const dispatchJob = source.split("dispatch-estate-readiness:")[1];
  assert.ok(dispatchJob, "the cross-repository OIDC refresh job must exist");
  assert.match(dispatchJob, /gh workflow run oidc-estate-readiness\\.yml --ref main --repo "\\$GITHUB_REPOSITORY"/);
});
