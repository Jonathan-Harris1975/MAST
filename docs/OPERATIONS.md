# MAST production operations

**Status:** Paid Koyeb production Worker  
**Last reviewed:** 20 September 2026

MAST is deployed as a Worker and maintains its own scheduler loop. HIVE monitors `state/mast/scheduler-state.json` in the `metasystem` R2 bucket and classifies health from heartbeat age, failure streak and operator-control state. MAST also exposes `/livez`, `/readyz` and authenticated operational/job detail for direct diagnostics.

## Routine checks

1. Confirm the Koyeb Worker deployment is healthy and `/readyz` reports ready.
2. Confirm `lastTickAt` advances and tick lag remains bounded.
3. Review failure streaks, duplicate-prevention count, recent results and the review queue.
4. Keep durable R2 state and run keys intact; they provide replay protection across restarts.
5. Use the separate R2 operator-control object for maintenance or an immediate scheduling pause.
6. Confirm AIMS-facing jobs resolve through the configured `AIMS_BASE_URL`; operators must not maintain per-job AIMS origins.

## Canonical AIMS cut-over

`AIMS_BASE_URL` is the single service origin for all AIMS jobs, managed AIMS pre-triggers and the AIMS lifecycle `/livez` probe.

For staging, migration or emergency endpoint replacement:

1. Configure the replacement origin, for example `AIMS_BASE_URL=https://replacement.example`.
2. Keep the value origin-only. A trailing slash is normalised; embedded credentials, paths, query strings and fragments are rejected.
3. Run `node --test test/aims-base-url-contract.test.js` and the full `npm test` suite before deployment.
4. Deploy without editing individual job paths.
5. Confirm `/readyz`, then inspect authenticated `/jobs` output and verify representative RSS, Outreach, audit, operation and pre-trigger jobs use the replacement origin.
6. Run `npm run ecosystem:smoke` from an appropriately configured environment, or use the GitHub **Ecosystem smoke** workflow.
7. Review HIVE operational events and MAST recent results before closing the cut-over.

Rollback is the same operation in reverse: restore the previous `AIMS_BASE_URL`, redeploy and repeat the contract/smoke validation. There is no list of per-job URLs to repair.

## Failure and retry behaviour

HTTP execution uses bounded timeouts and retries. Jobs that must not be replayed through generic HTTP retry set their own retry policy. Accepted asynchronous AIMS operations are polled until terminal completion; `failed` and `completed-with-failures` are not treated as successful cycles. Catch-up windows allow bounded recovery after scheduler interruption, while durable run keys prevent duplicate execution of the same governed window.

## Recovery

Pause scheduling, inspect the failed downstream contract, run one deliberately selected job, then resume only after the job result and subsequent heartbeat are healthy. For Blotato lane recovery, MAST calls the governed `/blotato/shorts/:lane/schedule` route; it does not use `/publish-now` in production.

Do not delete run keys during recovery. Full alerting, operator-control and deployment-watcher instructions are in [`OPERATIONAL_ALERTING.md`](OPERATIONAL_ALERTING.md).
