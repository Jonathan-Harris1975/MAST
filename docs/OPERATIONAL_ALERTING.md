# MAST professional operations and alerting

**Status:** Production Koyeb Worker
**Last reviewed:** 22 September 2026

MAST runs as a paid Koyeb Worker. It has no public inbound HTTP health contract. HIVE monitors the durable R2 heartbeat at `state/mast/scheduler-state.json`.

## Excellence controls

The scheduler state records tick lag, delayed ticks, successful and failed jobs, duplicate prevention, per-job failure streaks and a bounded review queue. Repeated failures send one central event when the configured threshold is first reached.

Operator control is stored separately at `state/mast/operator-control.json` in the `metasystem` bucket:

```json
{
  "schedulerEnabled": false,
  "maintenanceMode": true,
  "reason": "planned maintenance",
  "updatedAt": "2026-06-17T12:00:00Z"
}
```

The environment-level `SCHEDULER_ENABLED=false` remains the strongest stop. R2 operator control allows a controlled pause without redeploying. Removing the control object returns MAST to the environment default.

## Alert variables

```env
MAST_OPERATOR_CONTROL_OBJECT_KEY=state/mast/operator-control.json
MAST_FAILURE_REVIEW_THRESHOLD=3
MAST_REVIEW_QUEUE_LIMIT=50
OPS_ALERT_WEBHOOK_URL=https://<hive-api>/v1/ops/events
OPS_ALERT_WEBHOOK_TOKEN={{ secret.OPS_EVENT_INGEST_TOKEN }}
OPS_ALERT_TIMEOUT_MS=8000
```

## Deployment notifications

The Koyeb deployment-watch workflow runs after a successful MAST CI workflow on `main`. Configure the GitHub `Koyeb` environment secret `KOYEB_TOKEN`, environment variable `KOYEB_SERVICE` (the MAST service UUID), and optional environment secrets `OPS_ALERT_WEBHOOK_URL` and `OPS_ALERT_WEBHOOK_TOKEN`. The watcher polls the paid production Worker deployment and emits a redacted HIVE event on failure, unhealthy state, sustained degradation or timeout.

`KOYEB_TOKEN` and `KOYEB_SERVICE` are mandatory for automatic production verification. Missing either fails the job with only the missing variable name exposed. After the deployment watch passes, the workflow executes the smoke command inside the Koyeb Worker. The command checks `KOYEB_GIT_SHA` and reads `RMS_API_KEY` and `HIVE_ADMIN_BEARER_TOKEN` from the Worker's Koyeb environment; those keys are not copied to GitHub. Missing keys or a mismatched SHA fails the smoke. HIVE's authenticated repository-health endpoint must report MAST's fresh R2 heartbeat, and HIVE must be configured to wake RAMS through Koyeb. The green production attestation covers Worker/API integration and is retained with its smoke log for 90 days. HIVE-UI's separate deployed-integration workflow covers login and handoff with its own access key. The MAST smoke does not execute an internal MAST job. Alert delivery remains non-blocking and cannot replace or weaken those gates.

Run `node --test test/deployment-workflow-contract.test.js` for deterministic checks. On failure, correct the named Actions configuration, confirm the Koyeb service/token scope and expected SHA, then rerun the post-CI watcher; never infer deployment success from an alert or dispatch alone.

## Recovery

1. Set maintenance mode or `schedulerEnabled=false` in the R2 control object.
2. Inspect `reviewQueue`, `failureStreaks`, `recentResults` and the downstream provider evidence.
3. Do not delete run keys. They are replay protection.
4. Repair the downstream contract and run one deliberately selected job.
5. Clear maintenance mode only after its result and the next heartbeat are healthy.
