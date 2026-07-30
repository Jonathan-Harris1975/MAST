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

MAST resumes AIMS at **08:30 Europe/London** on Monday-Friday. Weekday AM operations begin at **09:00**. After the full morning window returns, MAST pauses AIMS immediately back to standby.

On Friday, MAST resumes AIMS again at **14:30** for the podcast-only window and pauses it when the podcast endpoint returns. RAMS is resumed only for governed audit windows. Future Comms Hub activity will request additional AIMS wake periods through its own controlled flow.

See [`docs/POWER_MANAGEMENT.md`](docs/POWER_MANAGEMENT.md).

## Weekday AIMS operations

MAST provides six normal weekday operation triggers. AIMS owns task sequencing inside each window.

- Monday-Friday AM: authenticated `/ops/run/<day>-am` at 09:00. Each morning window prepares all daily content, including both scheduled Blotato posts. Friday AM also prepares Saturday and Sunday Zernio content.
- Friday PM: authenticated `/ops/run/friday-pm` at 14:30. This window runs only the podcast pipeline.
- Task-level content routes remain manual recovery controls and do not carry their own schedules.

## Monthly audit windows

MAST has two scheduled audit entry points only:

- **First Saturday, 09:15:** `POST /audits/website/run`
- **Second Saturday, 09:15:** `POST /audits/aims/run`

AIMS owns every downstream audit stage, council, final report and RAMS remediation
sequence. MAST does not independently schedule RAMS rebuild pipelines. This keeps
monthly audit work away from Monday-Friday core operations.
