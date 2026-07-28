> **Document status:** Production reference  
> **Last reviewed:** 28 July 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# MAST

MAST is the master automation scheduler for the Jonathan Harris ecosystem. It runs as a paid Node.js Worker on Koyeb, evaluates governed schedules in the Europe/London time zone and triggers AIMS and RAMS routes with bounded retries.

## Production monitoring

MAST has no public inbound HTTP endpoint. It writes a durable scheduler heartbeat, metrics, review queue and replay-protection state to Cloudflare R2. HIVE reads that state to present Worker health in HIVE-UI. Local HTTP routes remain useful for tests and optional controlled diagnostics, but are not the production liveness contract.

## Local verification

```bash
npm ci --ignore-scripts
npm run verify
```

## Durable scheduler state

Production uses the `metasystem` R2 bucket for durable run keys and recent results. Set `MAST_STATE_BACKEND=r2`; local state is permitted only for tests or deliberate emergency operation.

## Koyeb deployment

Deploy as the intended paid production Worker with one active scheduler instance. Required production secrets are `CRON_ADMIN_TOKEN`, `AIMS_API_KEY`, `RMS_API_KEY`, R2 credentials and the HIVE operational-alert token. Public manual execution remains disabled. See [`.env.example`](.env.example), [`docs/OPERATIONS.md`](docs/OPERATIONS.md) and [`docs/OPERATIONAL_ALERTING.md`](docs/OPERATIONAL_ALERTING.md).

## Koyeb power management

MAST resumes AIMS at **09:00 Europe/London** on Monday-Friday and on the first two
Saturdays used for governed audits. Weekday AM operations begin at 09:15. RAMS is
resumed only for the first- and second-Saturday audit windows.

Shutdown is completion-driven. MAST waits until the final operation or audit endpoint
returns, then pauses the relevant service **one hour later**. There is no fixed 20:00
shutdown that can cut across a long podcast or audit run.

See [`docs/POWER_MANAGEMENT.md`](docs/POWER_MANAGEMENT.md).

## Weekday AIMS operations

MAST provides ten weekday operation triggers. AIMS owns task sequencing inside each
window.

- Monday-Friday AM: authenticated `/ops/run/<day>-am` at 09:15 by default.
- Monday-Thursday PM: authenticated `/ops/run/<day>-pm` at 18:30 by default.
- Friday PM: authenticated `/ops/run/friday-pm` at 15:00. This is the extended
  Blotato -> podcast -> Saturday/Sunday Zernio handoff window.
- Task-level content routes remain manual recovery controls and do not carry their own
  schedules.

## Monthly audit windows

MAST has two scheduled audit entry points only:

- **First Saturday, 09:15:** `POST /audits/website/run`
- **Second Saturday, 09:15:** `POST /audits/aims/run`

AIMS owns every downstream audit stage, council, final report and RAMS remediation
sequence. MAST does not independently schedule RAMS rebuild pipelines. This keeps
monthly audit work away from Monday-Friday core operations.
