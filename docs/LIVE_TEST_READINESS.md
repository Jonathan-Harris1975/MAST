# MAST controlled live-test readiness ledger

Updated: 2026-10-10 UTC. Status: **NOT READY**. Do not promote or run autonomous production recovery until every mandatory gate is verified on the exact merged main SHA.

| Requirement | Status | Implementation / evidence | Test or run | Observed result | Remaining dependency / owner |
|---|---|---|---|---|---|
| Cross-repository smoke checkout | blocked | .github/workflows/ecosystem-smoke.yml | https://github.com/Jonathan-Harris1975/MAST/actions/runs/38012062124 | AIMS SHA was fetched from MAST and failed; correction proposed in PR #98 | Merge and re-run; MAST maintainer |
| Staging Node/npm assertions | blocked | .github/workflows/staging-gate.yml | PR #98, overlapping PR #96 | Proposed assertions Node 22.23.3, npm 10.9.9; not yet verified in staging | Reconcile PRs and execute staging; MAST maintainer |
| Repair App identity | blocked | .github/workflows/autonomous-repair.yml | PR #97 | Proposed removal of hard-coded App ID; CI passed on PR branch | Confirm AUTONOMY_REPAIR_APP_ID and secret; repository administrator |
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
