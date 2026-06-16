# MAST production operations

**Status:** Production-controlled  
**Last reviewed:** 16 June 2026

## Deployment

Deploy MAST as a Koyeb Web Service from the root Dockerfile. The service must remain reachable so HIVE can probe `/health` and `/status`. Copy the exact public hostname from the Koyeb Domains panel for app/service `overall-frances/mast-1`; do not infer it from the resource reference.

## Required probes

- `/livez`: process liveness
- `/readyz`: scheduler and secret readiness
- `/status`: compact operational status
- `/status/details`: authenticated diagnostic detail

## Change control

Any schedule change requires a test run, review of the calculated next-run time in Europe/London and confirmation that pre-trigger warm-up jobs move with their source job. Use `/run/:id` only with the admin token and a deliberately selected job.

## Recovery

Disable `SCHEDULER_ENABLED` during incident containment, preserve the state file and logs, then roll back the deployment. Avoid manually replaying a job until idempotency and downstream state have been checked.

## Durable state

Use `MAST_STATE_BACKEND=r2` with the bucket-scoped `metasystem` credentials and `MAST_STATE_OBJECT_KEY=state/mast/scheduler-state.json`. Production readiness fails when only ephemeral local state is available unless `ALLOW_EPHEMERAL_STATE=true` is deliberately set for incident recovery.
