import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/oidc-readiness.yml", import.meta.url);

test("OIDC evidence is only marked verified after issuer JWKS signature and identity checks", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /header\.alg !== "RS256"/);
  assert.match(workflow, /discovery\.issuer !== issuer/);
  assert.match(workflow, /createPublicKey\(\{ key: matches\[0\], format: "jwk" \}\)/);
  assert.match(workflow, /verify\("RSA-SHA256"/);
  assert.match(workflow, /if \(!valid\) throw new Error/);
  assert.match(workflow, /claims\.exp <= now/);
  assert.match(workflow, /sha: process\.env\.GITHUB_SHA/);
  assert.match(workflow, /safe\.signature_verified = true/);
  assert.doesNotMatch(workflow, /safe_claims\["verified"\] = True/);
});
