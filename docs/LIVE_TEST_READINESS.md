# MAST controlled live-test readiness ledger

Updated: 2026-10-10 UTC. Status: **NOT READY**. Do not promote or run autonomous production recovery until every mandatory gate is verified on the exact merged main SHA.

| Requirement | Status | Implementation / evidence | Test or run | Observed result | Remaining dependency / owner |
|---|---|---|---|---|---|
| Cross-repository smoke checkout | blocked | .github/workflows/ecosystem-smoke.yml | https://github.com/Jonathan-Harris1975/MAST/actions/runs/38012062124 | AIMS SHA was fetched from MAST and failed; correction merged in PR #98 at 14af184901c0211743ab2d5baf9891ec030cd8a0 | Re-run against current main and retain success attestation; MAST maintainer |
| Staging Node/npm assertions | blocked | .github/workflows/staging-gate.yml | PR #98, overlapping PR #96 | Assertions merged on main for Node 22.23.3 and npm 10.9.9; staging not yet verified | Execute staging and retain evidence; MAST maintainer |
| Repair App identity | blocked | .github/workflows/autonomous-repair.yml | PR #97 | Hard-coded App ID fallback removed in merged PR #97; authentication subsequently failed with empty AUTONOMY_REPAIR_APP_ID | Configure AUTONOMY_REPAIR_APP_ID and matching secret; repository administrator |
| GitHub OIDC issuer/JWKS signature | blocked | .github/workflows/oidc-readiness.yml | Verify on current merged SHA | Signature and identity verification implemented, latest live result not established here | Successful workflow and evidence artifact; MAST maintainer |
| Eight-repository cloud-provider OIDC trust | blocked | .github/workflows/oidc-readiness.yml | Provider trust negative-case suite | Repository online check is not provider trust verification | Provider administrators for all eight repos |
| Exact SHA, provenance and rollback | blocked | .github/workflows/staging-gate.yml | Non-production staging rehearsal | No completed rehearsal evidence recorded | Deployment owner |
| CI/security and branch protection | blocked | .github/workflows | PR #98 latest commit c54b91d98b2f1a4f2fed98745788ca495b5aded8 | Checks in progress at last inspection | Required checks and authorised merge; maintainers |
| Live autonomous recovery | blocked | .github/workflows/autonomous-repair.yml | Controlled failure injection | Not witnessed | Incident commander and approver |

## Safe live-test runbook

1. Freeze and record exact main SHA, required checks, workflow run IDs, artefact digests, environment and provider trust policy IDs. Abort if any mandatory evidence is missing, stale, skipped or contradictory.
2. Verify cloud trust separately for each of AIMS, AIMS-UI, HIVE, HIVE-UI, IRS, MAST, RAMS and jonathan-harris-website. Check issuer, audience, subject, repository/ref/workflow/environment restrictions, token lifetime, permissions and separation between staging and production. Never print tokens.
3. Exercise wrong repository, branch, workflow, audience, environment, expired/replayed token and missing trust policy. Every case must fail closed; abort on any unexpected acceptance.
4. Rehearse on non-production services using dry-run and deliberately injected transient failure. Verify classification, deduplication, bounded retry, incident lease, audit evidence, escalation and no unapproved production mutation.
5. Verify current-SHA staging health and provenance, observability, rollback artefact and tested kill switch. Abort on any missing telemetry, mismatched SHA, provider outage or retry/PR loop.
6. Require an authorised human approval before enabling production-facing tests. Keep rollback operator and incident escalation available; restore last known-good artefact and disable automation on unexpected change or failed health probe.
7. Record immutable workflow run URLs, results, exact SHAs, provider policy evidence, approver and rollback outcome. Mark a gate verified only with actual evidence.

## Controlled failure-injection matrix

| Case | Expected behaviour |
|---|---|
| Wrong OIDC identity, audience, branch, environment or workflow | Deny token exchange; no deployment |
| Expired/replayed token or missing trust policy | Deny; actionable error; no skip |
| Provider outage or rate limit | Bounded retry/backoff then circuit breaker and escalation |
| Stale SHA or previous-run success | Reject promotion and stale attestation |
| Duplicate incident | One incident lease and at most one repair PR |
| Forked or malicious PR payload | No privileged execution of untrusted code |
| Failed health probe or rollback | Stop promotion, disable recovery and page operator |

This ledger records observed evidence and blockers, not a completion percentage or approval to conduct live testing.

## 2026-10-10 implementation update

Current baseline: `416d50382b6e895816fc935b0e4eda928eb1334e`. PR #96 and #97 merged.
Main CI https://github.com/Jonathan-Harris1975/MAST/actions/runs/38025753373,
CodeQL https://github.com/Jonathan-Harris1975/MAST/actions/runs/38025753375 and
security https://github.com/Jonathan-Harris1975/MAST/actions/runs/38025753378 succeeded.
These results do not verify subsequent PR commits or provider readiness.

PR #98 additionally separates caller `source_sha` from the deployed MAST SHA,
rejects stale caller/MAST HEADs and ungoverned callers, checks only MAST main,
and serialises the attestation with JSON.stringify. `source_sha` is a correlation
identity, never a claim that the caller deployment passed. Smoke remains a
functional MAST/downstream check, not the authoritative OIDC readiness gate.

`node --test test/smoke-identity.test.js test/deployment-workflow-contract.test.js`: 14/14 passed.

Repair authentication is externally blocked: run
https://github.com/Jonathan-Harris1975/MAST/actions/runs/38026520754 failed at
Mint autonomous repair GitHub App token with `AUTONOMY_REPAIR_APP_ID` empty.
Repository administrator must set the ID of the installed repair app, verify its
private key matches, then manually dispatch `autonomous-repair.yml` (its manual
path authenticates only, creates no repair PR). Do not restore the fallback ID.

Ruleset `24425908` requires ci-gate, CodeQL security alert gate, Trivy/Gitleaks/actionlint,
Analyze(actions), Analyze(python), up-to-date branch and resolved review threads.
No bypass or self-approval is authorised. Provider trust policies and a
non-production rehearsal remain unverified. Verdict: **NOT READY**.

## 2026-10-10 evidence reconciliation

Verified repository main HEAD: `14af184901c0211743ab2d5baf9891ec030cd8a0` (merged PR #98). The historical failures at runs [38012062124](https://github.com/Jonathan-Harris1975/MAST/actions/runs/38012062124) and [38011421947](https://github.com/Jonathan-Harris1975/MAST/actions/runs/38011421947) both failed in `actions/checkout` with `fatal: remote error: upload-pack: not our ref` when trying to fetch a foreign repository SHA from MAST. They predate the merged checkout correction and must not be treated as proof that the corrected workflow passes.

The OIDC readiness workflow currently verifies a **MAST-issued** GitHub JWT signature, issuer, audience, repository, ref, SHA and lifetime and independently records whether all eight governed default branches resolve. It does **not** verify token issuance in each other repository, any cloud-provider token exchange, cloud role scopes, provider-side subject restrictions or environment-specific trust. Its `oidc-estate-online.json` artifact must never be interpreted as provider trust readiness. An authoritative estate gate must fail closed on absent provider trust evidence before the readiness status can change.

**Release decision remains NOT READY.** No production test authorisation is implied by the code fixes or this documentation update.
