> **Document status:** Production reference  
> **Last reviewed:** 16 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# MAST

MAST is the master automation scheduler for the Jonathan Harris ecosystem. It runs as a paid Node.js Worker on Koyeb, evaluates governed schedules in the Europe/London time zone and triggers AIMS, RAMS and Hookdeck routes with bounded retries.

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

MAST also pauses and resumes the AIMS and RAMS Koyeb services on a schedule, instead of leaving them running (and billed per second) around the clock. See [`docs/POWER_MANAGEMENT.md`](docs/POWER_MANAGEMENT.md) for the schedule, required `KOYEB_TOKEN` scope and `KOYEB_SERVICE_ID_*` secrets, and how to disable it.

## Ten AIMS content-operation windows

Normal content scheduling is consolidated into ten weekday MAST triggers. MAST
calls the authenticated `https://app.jonathan-harris.online/ops/run/<window>`
endpoint and AIMS owns task-level orchestration inside the window.

- Monday-Friday AM: RSS rewrite, outreach, blog social, gated newsletter,
  weekday Zernio and the additional Blotato AutoShorts-style post.
- Monday AM additionally includes the weekly blog, Zernio ebooks and the weekly
  quiz. The Monday Zernio lane also owns topical mini-series selection.
- Monday-Thursday PM: the corresponding existing Blotato evening short lane.
- Friday PM is extended: Friday Blotato evening short, podcast pipeline, then
  Saturday and Sunday Zernio scheduling before weekend standby.

The former task-level content jobs remain manual recovery controls only, so they
cannot double-fire alongside the operation windows. AIMS traffic uses the
`app.jonathan-harris.online` base endpoint directly; Hookdeck is not part of
these MAST operation calls.
