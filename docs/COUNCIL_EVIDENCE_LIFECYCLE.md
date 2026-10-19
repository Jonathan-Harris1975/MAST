# Repository Council evidence and dispatch lifecycle

**Scope:** GitHub Actions and the `hive-repositories` R2 bucket. This describes code behaviour; it does not assert that credentials, the bucket policy, Kilo, or alert delivery have been live-tested.

## Evidence states

`council_gate.py` evaluates the current default-branch SHA and the newest non-PR run on that branch for each required workflow: `MAST CI`, `CodeQL`, and `Security and repository quality`.

| State | Meaning | Kilo dispatch |
|---|---|---|
| `evidence_not_produced` | A GitHub evidence query failed, a required workflow has no run, or a required run is incomplete | Blocked |
| `evidence_stale` | A required workflow's newest result is for a different commit | Blocked |
| `stale_sha` | Requested Council SHA is not the current default-branch head | Blocked |
| `gate_failed` | A required check failed or unresolved autonomy PR state exists | Blocked |
| `gate_passed` | All required checks are successful at the current exact SHA and no blocker exists | Eligible for the dispatch reservation |
| `dispatch_accepted` | The Kilo trigger returned a 2xx response and R2 ledger settlement succeeded | One accepted handoff recorded |
| `dispatch_rejected` / `dispatch_unknown` | Kilo returned non-2xx, or the network outcome was ambiguous | Blocked; manual reconciliation required |
| `duplicate_replay` | A prior ledger for the same repository and SHA records an accepted handoff | No new request sent |
| `dispatch_reconciliation_required` | The ledger has a reservation or non-accepted terminal state | No new request sent |
| `persistence_failed` | The reservation, settlement, or evidence persistence failed | No dispatch if reservation failed; if settlement failed after a 2xx, the durable reservation remains and prevents replay |

Every Council run retains local evidence as a 90-day Actions artifact, including gate failures. When a valid full SHA is available, the complete lifecycle directory is also written to R2 at `ci-reports/MAST/<ISO-year>/<ISO-week>/<sha>/council/<workflow-run-id>/attempt-<attempt>/`. The R2 manifest records repository, exact SHA, workflow run and attempt, object hashes, and an aggregate evidence digest. Repeating the same workflow attempt writes the same object keys.

Before Kilo is called, the workflow writes a durable reservation at `repository-evidence/Jonathan-Harris1975_MAST/council-ledger/<sha>/dispatch.json` using R2's atomic `If-None-Match: *` conditional write; settling the record uses `If-Match` against the read ETag. The per-SHA workflow concurrency group serialises callers as an additional guard. A settled accepted ledger makes later replays a no-op. A reserved, rejected, unknown, corrupt or unreadable ledger blocks dispatch and raises an incident for reconciliation. This is an at-most-one-attempt guard, not an exactly-once delivery claim. If a reservation is stranded, an operator must compare the Council run, Kilo receipt and R2 ledger before any owner-authorised ledger repair; never delete it to force a retry. See Cloudflare's [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/) notes for supported conditional writes.

## Owner configuration to verify

### GitHub Actions repository configuration

In `Jonathan-Harris1975/MAST`, verify the repository-scoped secrets used by the `Repository Council` workflow:

- `KILO_REPAIR_TRIGGER_URL`: the approved Kilo webhook URL; the workflow validates its host and HTTPS scheme.
- `R2_ENDPOINT` (or `R2_ENDPOINT_URL`): the account's bare `https://<account-id>.r2.cloudflarestorage.com` S3 endpoint.
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: an R2 API token with **Object Read & Write** permission scoped to the `hive-repositories` bucket only. The S3 API token's scope is bucket-level rather than object-prefix-level, so this credential can read and write other objects in that bucket; separate the bucket if that access is too broad. Do not grant account-wide R2 admin permissions. Cloudflare documents the token options in its [R2 authentication guide](https://developers.cloudflare.com/r2/api/tokens/).
- `OPS_ALERT_WEBHOOK_TOKEN` (or the existing `OPS_EVENT_INGEST_TOKEN` fallback) and `OPS_ALERT_WEBHOOK_URL`: credentials and route accepted by MAST's central operations event receiver.

Do not copy secret values into repository files or workflow logs. The workflow uses repository secrets directly; it does not currently declare a GitHub Environment for Council.

### R2 and Koyeb scheduler configuration

- Confirm the `hive-repositories` bucket exists and the Council Actions key can read and write only the Council evidence prefixes. Do not use MAST's scheduler-state bucket (`metasystem`) for Council evidence.
- The Koyeb MAST Worker needs its separate durable state configuration: `MAST_STATE_BACKEND=r2`, `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_META_SYSTEM=metasystem`. Production readiness also depends on its configured service IDs, health URLs, and operations webhook token. These settings are outside this repository change and were not inspected here.
- Koyeb does not execute the Council workflow or supply its GitHub Actions secrets. Do not treat Koyeb's scheduler health as proof that Council evidence persistence or Kilo dispatch works.

### GitHub OIDC trust contract across the eight repositories

The MAST OIDC readiness workflow validates a GitHub-issued JWT and exact repository/run claims. The daily estate workflow checks that every governed repository has a recent successful readiness run on its current `main` SHA. Neither workflow proves an external cloud provider accepted that identity. The ecosystem smoke workflow is a functional application check and is not OIDC evidence.

For each of AIMS, AIMS-UI, HIVE, HIVE-UI, IRS, MAST, RAMS, and jonathan-harris-website, the repository and provider owners must configure and verify:

- Issuer `https://token.actions.githubusercontent.com`.
- Audience exactly `https://github.com/Jonathan-Harris1975` for the current readiness workflow.
- Subject restricted to that repository's immutable repository ID and default branch `refs/heads/main`. The readiness job itself also verifies the exact `workflow_ref` `.github/workflows/oidc-readiness.yml@refs/heads/main`. Add that workflow claim as a provider-side condition where supported. If the provider cannot condition on the standalone `workflow_ref` claim, use a separately governed reusable workflow and bind the trust policy to its exact `job_workflow_ref`; do not grant the readiness workflow a broadly scoped role as a workaround.
- Separate staging and production identities/roles and least-privilege scopes. Bind environment-specific roles to a protected GitHub environment and its approved deployment branch/rules.
- Negative tests for the wrong repository, ref, workflow, audience, environment, expired token, and missing policy.

The current readiness job verifies the default GitHub subject (`repo:<owner>/<repo>:ref:refs/heads/main`) or GitHub's immutable repository-ID subject form. The owner ID is `205491236`; the repository IDs are already pinned in `.github/workflows/oidc-estate-readiness.yml`: AIMS `1106415939`, AIMS-UI `1323481583`, HIVE `1262518964`, HIVE-UI `1268367441`, IRS `1206529096`, MAST `1230128339`, RAMS `1231842308`, and jonathan-harris-website `1170187039`. Match the actual `sub` format reported by each repo's artifact and use the exact expected value. Neither default subject form carries workflow identity on its own. Provider trust must not be marked ready until its policy adds the narrower workflow restriction and a real token exchange has passed positive and negative tests. This MAST change cannot apply provider policies or update the other seven repositories.

At this task's read-only inspection, the current OIDC readiness workflow in each of AIMS, AIMS-UI, HIVE, HIVE-UI, IRS, RAMS, and jonathan-harris-website did not enforce an exact `workflow_ref` claim. The MAST estate workflow now checks each repository's workflow source at its current `main` SHA and will fail closed until those seven repositories adopt the check and produce a successful readiness run on the updated SHA. Each repository owner must make that code update and run its workflow; this MAST-only change deliberately does not write to those repositories.

## Live verification checklist

Run these only after the repository owner has verified the settings above and designated a non-production Kilo target:

1. Record the exact `main` SHA and the three required workflow run IDs. Confirm each run is completed, successful, and on that SHA.
2. In a non-production test repository/bucket, exercise missing output, stale workflow evidence, failed required check, and a current passing set. Expect local artifact and R2 record for each; expect no Kilo request for every blocked case.
3. Exercise R2 denial before reservation. Expect no Kilo request and an Actions failure/operations incident. Exercise settlement failure after a simulated 2xx. Expect the reservation to remain and automatic replay to remain blocked.
4. Replay the same repository/SHA after an accepted reservation. Expect `duplicate_replay` and no second Kilo request. Replay a reserved, rejected, or unknown ledger. Expect `dispatch_reconciliation_required` and no request.
5. Confirm the R2 manifest's repository, SHA, Council workflow run and attempt, each object digest, and aggregate digest. Confirm the operations event includes the same run URL and no secrets.
6. Repeat the OIDC token exchange separately for all eight repositories and verify the actual provider-side policy ID and negative cases. Do not infer this result from a MAST estate artifact or ecosystem smoke run.

The repository change performs none of these live writes, dispatches or token exchanges. Production readiness remains unverified until the owner records the evidence.
