# MAST

MAST is the master automation scheduler for the Jonathan Harris ecosystem. It runs as a Node.js Worker on Koyeb, evaluates governed schedules in the `Europe/London` time zone, controls service wake/standby windows and triggers AIMS audit/content operations with bounded retries and durable state.

## Production model

MAST does not require public inbound HTTP for normal scheduling. It writes heartbeat, metrics, run results, review state and replay protection to the configured Cloudflare R2 metasystem store. HIVE reads that operational state for HIVE-UI.

Use `MAST_STATE_BACKEND=r2` in normal production. Local state is for tests or deliberate emergency operation only.

## Weekday AIMS schedule

The current architecture has **six consolidated operation triggers**, not ten per-task schedules:

- Monday AM
- Tuesday AM
- Wednesday AM
- Thursday AM
- Friday AM
- Friday PM

AIMS remains continuously available. MAST triggers the AM window at **10:00** Monday-Friday and the podcast-only Friday PM window at **15:00**. Catch-up windows protect against short scheduler interruptions.

AIMS owns sequencing inside each content window. Individual RSS, Zernio, Blotato, blog and newsletter routes remain manual recovery controls. Outreach is the deliberate exception: MAST owns two weekday triggers at **09:00** and **16:00 Europe/London**, while the manual route remains recovery-only. The five Blotato recovery controls use `/blotato/shorts/:lane/schedule`; production recovery never calls the disabled immediate-publish route.

MAST polls AIMS operation status until accepted asynchronous work is terminal. `failed` and `completed-with-failures` prevent automatic standby from being treated as a successful cycle.

## Audit schedule

- **First Sunday:** wake RAMS at 10:00, run the website audit at 10:30; AIMS remains online.
- **Second Saturday:** wake RAMS at 09:00 and run the AIMS/content governance audit at 09:15; AIMS remains online.

AIMS owns downstream councils and RAMS hand-off. MAST does not separately schedule individual RAMS remediation pipelines.

## HIVE governance

MAST also contains seven-day HIVE readiness/repository/provider health checks plus weekly and monthly governance. HIVE stays online continuously, and every HIVE scheduled job is readiness-gated before execution.

## Service control

Koyeb service IDs are supplied through environment variables. AIMS and HIVE are always-on; scheduled Koyeb power management applies only to RAMS. Operator recovery controls remain available and MAST maintains the lifecycle ledger.

## Local verification

```bash
npm ci --ignore-scripts
npm run verify
```

## Production network model

MAST intentionally uses authenticated public HTTPS endpoints for AIMS, RAMS and HIVE. NetBird and Hookdeck are not part of the production architecture. Service credentials remain in Koyeb Secrets, downstream requests use bearer authentication where required, public manual execution remains disabled by default, and operational status responses do not expose credentials or full downstream request details.

Production endpoint overrides must use HTTPS. Restrict ingress at the hosting/CDN layer wherever a service does not need general public access, keep service tokens independently scoped and rotated, and retain HIVE operational alerting so failed or unauthorised scheduling attempts are observable.

See `.env.example`, `docs/OPERATIONS.md`, `docs/POWER_MANAGEMENT.md`, `docs/OPERATIONAL_ALERTING.md` and `SECURITY.md`.
