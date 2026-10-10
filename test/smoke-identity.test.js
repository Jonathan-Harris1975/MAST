import assert from "node:assert/strict";
import test from "node:test";
import { validateSmokeIdentity } from "../scripts/validateSmokeIdentity.js";
const mast = "a".repeat(40), source = "b".repeat(40);
const env = { SOURCE_REPOSITORY: "Jonathan-Harris1975/AIMS", SOURCE_SHA: source,
  GITHUB_REPOSITORY: "Jonathan-Harris1975/MAST", GITHUB_SHA: mast, GITHUB_REF: "refs/heads/main" };
const api = path => path.includes("/branches/") ? { commit: { sha: path.includes("/MAST/") ? mast : source } } : { default_branch: "main" };
test("cross-repository caller never becomes MAST deployed identity", () => {
  assert.equal(validateSmokeIdentity(env, api).deployed_mast_sha, mast);
});
for (const [field, value] of [["SOURCE_REPOSITORY", "attacker/repo"], ["SOURCE_SHA", "c".repeat(40)],
  ["GITHUB_SHA", "c".repeat(40)], ["GITHUB_REF", "refs/heads/untrusted"], ["SOURCE_SHA", "invalid"]]) {
  test(`smoke rejects invalid or stale ${field}`, () => assert.throws(() => validateSmokeIdentity({ ...env, [field]: value }, api)));
}
test("source provider outage fails closed", () => assert.throws(() => validateSmokeIdentity(env, () => { throw Error("outage"); })));
