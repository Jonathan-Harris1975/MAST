# MAST production operations

**Status:** Paid Koyeb production Worker  
**Last reviewed:** 22 September 2026

MAST is deployed as a Worker and maintains its own scheduler loop. HIVE monitors `state/mast/scheduler-state.json` in the `metasystem` R2 bucket and classifies health from heartbeat age, failure streak and operator-control state. MAST's `/livez`, `/readyz` and authenticated operational/job handlers have no public inbound route on Koyeb Worker; use them only in a local or otherwise reachable diagnostic environment.

## Routine checks

1. Confirm the Koyeb Worker deployment is healthy and HIVE's authenticated `/v1/system/repo-health?force_refresh=true` reports MAST as a healthy `background_worker` with source `r2_s3` (or `r2_public`).
2. Confirm `lastTickAt` advances and tick lag remains bounded.
3. Review failure streaks, duplicate-prevention count, recent results and the review queue.
4. Keep durable R2 state and run keys intact; they provide replay protection across restarts.
5. Use the separate R2 operator-control object for maintenance or an immediate scheduling pause.
6. Confirm AIMS-facing jobs resolve through the configured `AIMS_BASE_URL`; operators must not maintain per-job AIMS origins.
7. Confirm the automatic post-CI watcher observed the expected Koyeb source SHA and the mandatory Worker/API smoke completed on that exact Worker instance before accepting its retained production attestation. Check the HIVE-UI deployed-integration attestation separately for login and handoff.

Missing `KOYEB_TOKEN`, `KOYEB_SERVICE`, the expected commit SHA or the Worker's Koyeb-resident `RMS_API_KEY`/`HIVE_ADMIN_BEARER_TOKEN` fails the production watcher; no automatic `main` path silently skips verification. GitHub's `Koyeb` environment supplies the service ID and control token only. Run `node --test test/deployment-workflow-contract.test.js` for the credential-free workflow contract. Container CI also scans the built `mast:ci` image and rejects fixable High/Critical OS or library vulnerabilities while retaining the readable report.

## Canonical AIMS cut-over

`AIMS_BASE_URL` is the single service origin for all AIMS jobs, managed AIMS pre-triggers and the AIMS lifecycle `/livez` probe.

For staging, migration or emergency endpoint replacement:

1. Configure the replacement origin, for example `AIMS_BASE_URL=https://replacement.example`.
2. Keep the value origin-only. A trailing slash is normalised; embedded credentials, paths, query strings and fragments are rejected.
3. Run `node --test test/aims-base-url-contract.test.js` and the full `npm test` suite before deployment.
4. Deploy without editing individual job paths.
5. Confirm the HIVE R2 heartbeat, then inspect MAST's local job registry and durable results to verify representative RSS, Outreach, audit, operation and pre-trigger jobs use the replacement origin.
6. Run `npm run ecosystem:smoke` from an appropriately configured environment, or use the GitHub **Ecosystem smoke** workflow.
7. Review HIVE operational events and MAST recent results, including the actual `suite-health-ping` result, before closing the cut-over.

Rollback is the same operation in reverse: restore the previous `AIMS_BASE_URL`, redeploy and repeat the contract/smoke validation. There is no list of per-job URLs to repair.

## Failure and retry behaviour

HTTP execution uses bounded timeouts and retries. Jobs that must not be replayed through generic HTTP retry set their own retry policy. Accepted asynchronous AIMS and HIVE operations are polled until terminal completion; `failed` and `completed-with-failures` are not treated as successful cycles. The HIVE full-estate repository refresh additionally validates the terminal payload: `repository_count=8`, `completed_count=8`, `failed_count=0`, `ok=true`, and the result set must contain exactly `HIVE`, `HIVE-UI`, `AIMS`, `AIMS-UI`, `RAMS`, `MAST`, `IRS`, and `Website`. Catch-up windows allow bounded recovery after scheduler interruption, while durable run keys prevent duplicate execution of the same governed window.

## Recovery

Pause scheduling, inspect the failed downstream contract, run one deliberately selected job, then resume only after the job result and subsequent heartbeat are healthy. For Blotato lane recovery, MAST calls the governed `/blotato/shorts/:lane/schedule` route; it does not use `/publish-now` in production.

Do not delete run keys during recovery. Full alerting, operator-control and deployment-watcher instructions are in [`OPERATIONAL_ALERTING.md`](OPERATIONAL_ALERTING.md).
