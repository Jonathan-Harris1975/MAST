# MAST

MAST is the master automation scheduler for the Jonathan Harris ecosystem. It runs on Node.js 22, evaluates governed schedules in the `Europe/London` time zone, triggers AIMS and HIVE operations over HTTP, controls RAMS wake/standby windows through Koyeb, and persists scheduler state in Cloudflare R2.

## Architecture

MAST has four main runtime responsibilities:

1. **Schedule evaluation.** `src/jobs.js` defines the governed job registry and `src/scheduler.js` decides when each job is due, prevents duplicate execution and applies bounded catch-up windows.
2. **HTTP execution.** Scheduled and manual jobs call downstream services with the configured authentication token, timeout/retry policy and response contract. Accepted asynchronous AIMS work is polled until it reaches a terminal state.
3. **Durable state and observability.** Production heartbeat, run keys, recent results, failure streaks, review state and operator control are stored in the configured Cloudflare R2 metasystem bucket. Structured logs and HIVE operational events provide failure evidence without exposing credentials.
4. **Service lifecycle control.** AIMS and HIVE remain online continuously. RAMS is resumed for bounded audit/remediation windows and can return to standby after terminal completion.

The production container is built from `Dockerfile`, runs as a non-root user on Node.js 22.23.2 and exposes the MAST HTTP API on port 8000. `/livez` is the container liveness endpoint and `/readyz` reports scheduler/configuration readiness.

## Canonical AIMS service origin

`AIMS_BASE_URL` is the **single canonical AIMS service origin**. Every AIMS-facing job, managed pre-trigger and AIMS lifecycle health probe derives its URL from that value. Do not edit individual job URLs during staging, hostname migration or emergency cut-over.

Examples:

```env
AIMS_BASE_URL=https://replacement.example
```

A trailing slash is accepted and normalised. The value must be an absolute `http` or `https` origin with no embedded credentials, path, query string or fragment. Production endpoint overrides must use HTTPS. Invalid origin values fail during configuration/job construction rather than producing a partially migrated scheduler.

AIMS paths remain defined per job, for example `/ops/run/monday-am`, `/outreach/batch/next`, `/audits/monthly/website` and `/livez`. Path construction is root-relative and cannot switch the request to a different origin.

## Production scheduling model

### Weekday AIMS schedule

The current architecture has **six consolidated operation triggers**:

- Monday-Friday AM at **10:00 Europe/London**
- Friday podcast-only PM at **17:00 Europe/London**

AIMS owns sequencing inside each content window. Individual RSS, Zernio, Blotato, blog and newsletter routes remain manual recovery controls. Outreach is the deliberate exception: MAST owns two weekday triggers at **09:00** and **16:00 Europe/London**. The five Blotato recovery controls use `/blotato/shorts/:lane/schedule`; production recovery does not call the disabled immediate-publish route.

### Audit schedule

- **First Sunday:** resume RAMS at 10:00 and run the website audit at 10:30.
- **Second Saturday:** resume RAMS at 09:00 and run the AIMS/content governance audit at 09:15.

AIMS owns downstream councils and RAMS hand-off. MAST waits for terminal completion and does not separately schedule individual RAMS remediation pipelines.

### HIVE governance

MAST runs seven-day HIVE readiness/repository/provider checks plus weekly and monthly governance jobs. HIVE remains online continuously and scheduled HIVE jobs are readiness-gated before execution. After the second-Saturday AIMS audit completes, MAST triggers HIVE's asynchronous `/v1/repositories/refresh-all` workflow and polls `/v1/repositories/refresh-jobs/{job_id}` to terminal completion. A refresh is accepted as successful only when HIVE reports the exact governed catalogue (`HIVE`, `HIVE-UI`, `AIMS`, `AIMS-UI`, `RAMS`, `MAST`, `IRS`, `Website`), all eight results are complete, and none failed. Duplicate scheduler execution cannot start a second in-process refresh for the same job, and the monthly window is consumed after a terminal/transport failure so the expensive full-estate POST is not replayed every tick.

## Configuration

Use `.env.example` as the configuration reference and store secret values in the deployment secret manager, not in the repository.

| Area | Key variables | Purpose |
| --- | --- | --- |
| AIMS | `AIMS_BASE_URL`, `AIMS_API_KEY`, `AIMS_PRETRIGGER_CHECKS_ENABLED` | Canonical AIMS routing, authentication and pre-trigger checks. |
| RAMS/HIVE | `RMS_API_KEY`, `HIVE_BASE_URL`, `HIVE_HEALTH_URL`, `HIVE_ADMIN_BEARER_TOKEN` | Downstream service calls and readiness. |
| Scheduler | `SCHEDULER_ENABLED`, `SCHEDULER_TICK_SECONDS`, `MAST_*_TIME`, `MAST_*_CATCH_UP_MINUTES` | Scheduler cadence and governed operation windows. |
| State | `MAST_STATE_BACKEND`, `R2_*`, `MAST_STATE_OBJECT_KEY`, `MAST_OPERATOR_CONTROL_OBJECT_KEY` | Durable scheduler state and operator control. |
| Koyeb | `KOYEB_TOKEN`, `KOYEB_SERVICE_ID_*`, `KOYEB_POWER_MANAGEMENT_ENABLED` | RAMS lifecycle control and operator recovery. |
| Operations | `OPS_ALERT_WEBHOOK_URL`, `OPS_ALERT_WEBHOOK_TOKEN` | Central HIVE operational event delivery. |

Production uses `MAST_STATE_BACKEND=r2`. Local/ephemeral state is intended for tests or deliberate development operation only.

## Development and validation

Clean install and repository validation:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run secret:scan
npm run perf:gate
npm audit --omit=dev --audit-level=high
```

`npm test` includes the AIMS base-URL contract. That test constructs the full job registry with `AIMS_BASE_URL=https://replacement.example` and verifies every AIMS job follows the replacement origin, including RSS, Outreach, GET/POST controls, audits and managed pre-triggers. It also guards executable scheduler code against reintroducing the historical production AIMS origin.

Docker validation mirrors CI:

```bash
docker build -t mast:ci .
docker run --rm mast:ci node -e "const major=Number(process.versions.node.split('.')[0]); if (major !== 22) process.exit(1);"
```

The CI workflow additionally boots the image with local state and checks `/health`. Repository-defined release gates are `.github/workflows/ci.yml`, `.github/workflows/staging-gate.yml`, `.github/workflows/ecosystem-smoke.yml`, `.github/workflows/codeql.yml` and the Koyeb deployment watcher.

## Deployment and operations

MAST is deployed as a Koyeb Worker. Normal scheduling does not depend on an external caller: the process evaluates its own registry and writes durable state to R2. The HTTP API provides health/readiness, authenticated job/status detail and controlled manual execution.

For an AIMS hostname migration or emergency cut-over:

1. Set the new origin in `AIMS_BASE_URL`; do not alter individual job paths.
2. Run `npm test` (or at minimum `node --test test/aims-base-url-contract.test.js`) against the proposed origin value.
3. Deploy MAST with the new environment value.
4. Confirm `/readyz` is ready and inspect the authenticated `/jobs` registry for the expected AIMS paths.
5. Run the governed ecosystem smoke and confirm AIMS readiness plus the real `suite-health-ping` MAST job.
6. Review structured job results and HIVE operational events for failures before considering the cut-over complete.

The production ecosystem smoke in `scripts/ecosystemSmoke.js` verifies AIMS and MAST readiness, executes MAST's real `suite-health-ping` job into AIMS, wakes RAMS and admits an `on-brand` dry-run, verifies HIVE dependency/provider/database readiness, exercises authenticated HIVE-UI to AIMS-UI hand-off, and sends one first-party CogniPal message/sync round trip.

The GitHub Actions environment must provide `MAST_BASE_URL`, `HIVE_UI_BASE_URL` and `AIMS_UI_BASE_URL` as repository variables (or `MAST_BASE_URL` as a secret), plus `CRON_ADMIN_TOKEN`, `RMS_API_KEY`, `HIVE_ADMIN_BEARER_TOKEN` and `HIVE_UI_ACCESS_KEY` as Actions secrets. `AIMS_BASE_URL`, `RAMS_BASE_URL`, `HIVE_BASE_URL` and `WEBSITE_BASE_URL` have governed production defaults in the workflows and may be overridden with repository variables. Missing required endpoints or credentials fail the smoke rather than silently skipping a service.

## Network and security model

MAST uses authenticated public HTTPS endpoints for AIMS, RAMS and HIVE in production. Service-to-service HIVE calls use the direct HIVE backend; the HIVE-UI origin remains operator-facing. NetBird and Hookdeck are not part of the production architecture. Downstream credentials remain in Koyeb Secrets, public manual execution is disabled by default, and operational status responses do not expose credentials or full downstream request details.

Restrict ingress at the hosting/CDN layer wherever a service does not need general public access, keep service tokens independently scoped and rotated, and retain HIVE operational alerting so failed or unauthorised scheduling attempts remain observable.

See `.env.example`, `docs/OPERATIONS.md`, `docs/POWER_MANAGEMENT.md`, `docs/OPERATIONAL_ALERTING.md` and `SECURITY.md`.
