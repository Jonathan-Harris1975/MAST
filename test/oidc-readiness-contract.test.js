import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = new URL("../.github/workflows/oidc-readiness.yml", import.meta.url);

test("MAST OIDC readiness binds token to owner, subject, repository, ref and SHA", async () => {
  const source = await readFile(workflow, "utf8");
  assert.match(source, /sub: `repo:\$\{process\.env\.EXPECTED_REPOSITORY\}:ref:\$\{process\.env\.EXPECTED_REF\}`/);
  assert.match(source, /repository_owner: process\.env\.EXPECTED_OWNER/);
  assert.match(source, /sha: process\.env\.GITHUB_SHA/);
  assert.match(source, /claims\[name\] !== value/);
});

test("MAST OIDC readiness rejects stale and overly long-lived JWTs", async () => {
  const source = await readFile(workflow, "utf8");
  assert.match(source, /claims\.iat < now - 600/);
  assert.match(source, /claims\.exp - claims\.iat > 600/);
  assert.match(source, /claims\.exp <= now/);
  assert.match(source, /signature invalid/);
});

test("OIDC artifact explicitly excludes provider trust certification", async () => {
  const source = await readFile(workflow, "utf8");
  assert.match(source, /no cloud provider trust verified/);
  assert.match(source, /oidc-estate-online\.json/);
});
