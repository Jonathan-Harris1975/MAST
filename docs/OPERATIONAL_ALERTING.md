# MAST professional operations and alerting

**Status:** Production Koyeb Worker  
**Last reviewed:** 17 June 2026

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

The Koyeb deployment-watch workflow runs after a successful MAST CI workflow on `main`. Configure GitHub secrets `KOYEB_TOKEN`, `KOYEB_SERVICE`, `OPS_ALERT_WEBHOOK_URL` and `OPS_ALERT_WEBHOOK_TOKEN`. The watcher polls the paid production Worker deployment and emits a redacted HIVE event on failure, unhealthy state, sustained degradation or timeout.

## Recovery

1. Set maintenance mode or `schedulerEnabled=false` in the R2 control object.
2. Inspect `reviewQueue`, `failureStreaks`, `recentResults` and the downstream provider evidence.
3. Do not delete run keys. They are replay protection.
4. Repair the downstream contract and run one deliberately selected job.
5. Clear maintenance mode only after its result and the next heartbeat are healthy.
