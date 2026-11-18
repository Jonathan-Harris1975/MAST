import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const readinessWorkflow = new URL("../.github/workflows/oidc-readiness.yml", import.meta.url);
const estateWorkflow = new URL("../.github/workflows/oidc-estate-readiness.yml", import.meta.url);

test("retired local OIDC readiness workflow is absent and not checked as estate evidence", async () => {
  await assert.rejects(access(readinessWorkflow), { code: "ENOENT" });
  const estate = await readFile(estateWorkflow, "utf8");
  assert.doesNotMatch(estate, /\{ name: "MAST", id:/);
  assert.match(estate, /\{ name: "AIMS", id:/);
  assert.match(estate, /\{ name: "jonathan-harris-website", id:/);
  assert.match(estate, /no cloud provider trust is verified/);
});
