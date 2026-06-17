# MAST production operations

**Status:** Paid Koyeb production Worker  
**Last reviewed:** 17 June 2026

MAST is deployed as a Worker, not a Web Service. It has no public inbound probe. HIVE monitors `state/mast/scheduler-state.json` in the `metasystem` R2 bucket and classifies health from heartbeat age, failure streak and operator-control state.

## Routine checks

1. Confirm the Koyeb Worker deployment is healthy.
2. Confirm `lastTickAt` advances and tick lag remains bounded.
3. Review failure streaks, duplicate-prevention count and review queue.
4. Keep durable R2 state and run keys intact.
5. Use the separate R2 operator-control object for maintenance or an immediate scheduling pause.

## Recovery

Pause scheduling, inspect the failed downstream contract, run one selected job, then resume only after the heartbeat and result are healthy. Full alerting, operator-control and deployment-watcher instructions are in [`OPERATIONAL_ALERTING.md`](OPERATIONAL_ALERTING.md).
