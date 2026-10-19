import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = new URL("../.github/workflows/oidc-readiness.yml", import.meta.url);

test("MAST OIDC readiness binds both default subject formats to immutable repository identity", async () => {
  const source = await readFile(workflow, "utf8");
  assert.match(source, /repository_owner: process\.env\.EXPECTED_OWNER/);
  assert.match(source, /repository_owner_id: process\.env\.EXPECTED_OWNER_ID/);
  assert.match(source, /repository_id: process\.env\.EXPECTED_REPOSITORY_ID/);
  assert.match(source, /const legacySubject = `repo:\$\{process\.env\.EXPECTED_REPOSITORY\}:ref:\$\{process\.env\.EXPECTED_REF\}`/);
  assert.match(source, /const immutableSubject = `repo:\$\{process\.env\.EXPECTED_OWNER\}@\$\{process\.env\.EXPECTED_OWNER_ID\}\/\$\{process\.env\.EXPECTED_REPOSITORY\.split\("\/"\)\[1\]\}@\$\{process\.env\.EXPECTED_REPOSITORY_ID\}:ref:\$\{process\.env\.EXPECTED_REF\}`/);
  assert.match(source, /claims\.sub !== legacySubject && claims\.sub !== immutableSubject/);
  assert.match(source, /workflow_ref: process\.env\.EXPECTED_WORKFLOW_REF/);
  assert.match(source, /\.github\/workflows\/oidc-readiness\.yml@refs\/heads\/main/);
  assert.match(source, /sha: process\.env\.GITHUB_SHA/);
  assert.match(source, /claims\[name\] !== value/);
});

test("MAST OIDC readiness rejects stale and overly long-lived JWTs", async () => {
  const source = await readFile(workflow, "utf8");
  assert.match(source, /claims\.iat\s*<\s*now\s*-\s*600/);
  assert.match(source, /claims\.exp\s*-\s*claims\.iat\s*>\s*600/);
  assert.match(source, /claims\.exp <= now/);
  assert.match(source, /OIDC JWT signature invalid/);
});

test("OIDC artifact explicitly excludes provider trust certification", async () => {
  const source = await readFile(workflow, "utf8");
  assert.match(source, /no cloud provider trust verified/);
  assert.match(source, /oidc-estate-online\.json/);
});
