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

MAST resumes AIMS at **09:30** Monday-Friday and triggers the AM window at **10:00**. Friday also resumes AIMS at **14:30** and triggers the podcast-only PM window at **15:00**. Catch-up windows protect against short scheduler/cold-start interruptions.

AIMS owns sequencing inside each window. Individual RSS, Zernio, Blotato, blog, newsletter and outreach routes remain manual recovery controls and do not have independent production schedules in MAST. The five Blotato recovery controls use `/blotato/shorts/:lane/schedule`; production recovery never calls the disabled immediate-publish route.

MAST polls AIMS operation status until accepted asynchronous work is terminal. `failed` and `completed-with-failures` prevent automatic standby from being treated as a successful cycle.

## Audit schedule

- **First Sunday:** wake AIMS/RAMS at 10:00, run the website audit at 10:30.
- **Second Saturday:** wake AIMS for the AIMS/content governance audit window and run the scheduled AIMS audit at 09:15.

AIMS owns downstream councils and RAMS hand-off. MAST does not separately schedule individual RAMS remediation pipelines.

## HIVE governance

MAST also contains scheduled HIVE readiness, repository/provider health, environment/hygiene, skills/storage/connector/model governance and monthly AI Council/optimisation review tasks. These are separate from the six AIMS operating windows.

## Service control

Koyeb service IDs are supplied through environment variables. HIVE can enqueue bounded `service.resume`/`service.pause` commands through the R2 operator-control channel. MAST records the result and maintains the service lifecycle ledger. Maintenance mode defers operator commands.

## Local verification

```bash
npm ci --ignore-scripts
npm run verify
```

## Outstanding infrastructure dependency

The roadmap's private-network hardening is not implemented in this repository: current defaults still reference public AIMS/RAMS/HIVE hostnames and no NetBird/Hookdeck private-routing configuration is present. That work must be completed at infrastructure level and then reflected in endpoint defaults/environment configuration.

See `.env.example`, `docs/OPERATIONS.md`, `docs/POWER_MANAGEMENT.md`, `docs/OPERATIONAL_ALERTING.md` and `SECURITY.md`.
