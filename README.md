<!-- Trusted branch-controller replay of the validated MAST smoke decoupling change. -->
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

- **First Saturday:** resume RAMS at 13:00 and run the website audit at 13:30.
- **Second Saturday:** resume RAMS at 09:00 and run the AIMS/content governance audit at 09:15.

### one.com mailbox maintenance

On the **first day of each month at 03:00 Europe/London**, MAST calls AIMS to permanently empty the server-advertised Trash and Junk/Spam folders for `info@`, `admin@` and `newsletter@jonathan-harris.online`. `MAST_EMAIL_CLEANUP_TIME` changes the time, and `MAST_EMAIL_CLEANUP_CATCH_UP_MINUTES` controls same-day recovery after downtime. The job is non-retried at the HTTP layer, consumes a failed monthly window, and accepts success only when AIMS reports all three governed accounts complete.

At **04:00 Europe/London on day 1**, MAST starts the complete Comms Hub housekeeping cycle. Its strict response policy requires retention health, database janitor, quarantine review, private-storage reconciliation, telemetry/audit archive, backup restore/rotation and Info-mail archive stages to be present and successful. `MAST_COMMS_HOUSEKEEPING_TIME` and `MAST_COMMS_HOUSEKEEPING_CATCH_UP_MINUTES` control this window. The exact confirmation body and the AIMS D1 window ledger prevent an accidental duplicate mutating run.

Every **Saturday at 08:00 Europe/London**, MAST requests the separate quarantine review. That job reports unresolved items and raises AIMS operator notifications; it does not request their deletion. Configure the window with `MAST_COMMS_QUARANTINE_REVIEW_TIME` and `MAST_COMMS_QUARANTINE_REVIEW_CATCH_UP_MINUTES`.

AIMS owns downstream councils and RAMS hand-off. MAST waits for terminal completion and does not separately schedule individual RAMS remediation pipelines.

### HIVE governance

MAST runs seven-day HIVE readiness/repository/provider checks plus weekly and monthly governance jobs. HIVE remains online continuously and scheduled HIVE jobs are readiness-gated before execution. Daily governance also verifies HIVE's authoritative `/v1/system/production-manager?force_refresh=true` state is `GREEN / ALLOW`, while a 23:50 Europe/London freshness check keeps monthly AI Council governance visibly unhealthy until the current month's cycle and AIMS/RAMS propagation are verified. Retired `/v1/skills/*` routes are intentionally not scheduled. After the second-Saturday AIMS audit completes, MAST triggers HIVE's asynchronous `/v1/repositories/refresh-all` workflow and polls `/v1/repositories/refresh-jobs/{job_id}` to terminal completion. A refresh is accepted as successful only when HIVE reports the exact governed catalogue (`HIVE`, `HIVE-UI`, `AIMS`, `AIMS-UI`, `RAMS`, `MAST`, `IRS`, `Website`), all eight results are complete, and none failed. Duplicate scheduler execution cannot start a second in-process refresh for the same job, and the monthly window is consumed after a terminal/transport failure so the expensive full-estate POST is not replayed every tick.

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

The CI workflow additionally boots the image with local state, checks `/health`, then scans the actual `mast:ci` image for fixable High/Critical OS and library vulnerabilities. The pinned Trivy gate ignores vulnerabilities for which no upstream fix exists and retains its table report for 90 days; fixable High/Critical findings fail CI. A matching local scan is `trivy image --ignore-unfixed --vuln-type os,library --severity HIGH,CRITICAL --exit-code 1 mast:ci`.

Repository-defined release gates are `.github/workflows/ci.yml`, `.github/workflows/staging-gate.yml`, `.github/workflows/ecosystem-smoke.yml`, `.github/workflows/codeql.yml` and the Koyeb deployment watcher. `npm test` includes deterministic contracts for the watcher, mandatory smoke ordering and image scan.

## Deployment and operations

MAST is deployed as a Koyeb Worker. Normal scheduling does not depend on an external caller: the process evaluates its own registry and writes durable state to R2. Its HTTP handlers are available inside the process for local diagnostics, but the Worker has no public inbound HTTP route. HIVE reads the R2 heartbeat to monitor production health.

For an AIMS hostname migration or emergency cut-over:

1. Set the new origin in `AIMS_BASE_URL`; do not alter individual job paths.
2. Run `npm test` (or at minimum `node --test test/aims-base-url-contract.test.js`) against the proposed origin value.
3. Deploy MAST with the new environment value.
4. Confirm the MAST OIDC readiness workflow has verified all eight governed GitHub repositories and their default branches are reachable. HIVE `/v1/system/repo-health` remains an operational health view, not the canonical repository-online authority.
5. Run the governed ecosystem smoke and confirm AIMS readiness, the Worker heartbeat and downstream paths.
6. Review the actual `suite-health-ping` result in MAST's durable state and HIVE operational events before considering the cut-over complete; the external smoke does not trigger a Worker job.

The production MAST Worker/API smoke in `scripts/ecosystemSmoke.js --worker <MAST_SHA>` executes inside the deployed Koyeb Worker. During the deployment-watch workflow it defers only the self-referential HIVE Production Manager assertion until the deployment workflow has completed, while still verifying AIMS readiness, MAST's fresh R2 heartbeat, RAMS wake/dry-run, HIVE dependency/provider/database readiness, and current-month AI Council freshness with verified AIMS/RAMS propagation. A separate ecosystem-smoke workflow then runs automatically after a successful deployment watch and requires HIVE Production Manager `GREEN / ALLOW`, eliminating the circular dependency without weakening final certification. It first checks that the selected instance has the expected `KOYEB_GIT_SHA`. It reports failed jobs from the durable history for operations review; historical failures do not alter the live deployment result. It does not remotely execute a MAST job and it does not validate website application features. The separate HIVE-UI deployed-integration workflow tests authenticated login, session, HIVE proxy and AIMS-UI handoff using the HIVE-UI repository's own key; it dispatches the MAST Worker/API smoke after that test passes.

The automatic production workflow uses the GitHub `Koyeb` environment: set `KOYEB_TOKEN` as an environment secret and `KOYEB_SERVICE` as the MAST service UUID environment variable for exact-SHA deployment verification and Koyeb CLI execution. Keep `RMS_API_KEY` and `HIVE_ADMIN_BEARER_TOKEN` in MAST's Koyeb Worker environment; GitHub Actions never receives their values. HIVE must monitor MAST from `state/mast/scheduler-state.json` in R2 (`MAST_MONITOR_MODE=r2`), and HIVE's Koyeb RAMS wake control must be configured. The remote smoke uses governed production URL defaults; set `AIMS_BASE_URL`, `RAMS_BASE_URL` and `HIVE_BASE_URL` on the Koyeb Worker when overriding them. Missing required configuration or a mismatched Worker SHA fails closed. The production attestation covers the bounded deployment watch and Worker/API smoke; HIVE-UI's separate deployed-integration attestation covers the authenticated UI path.

## Network and security model

MAST uses authenticated public HTTPS endpoints for AIMS, RAMS and HIVE in production. Service-to-service HIVE calls use the direct HIVE backend; the HIVE-UI origin remains operator-facing. NetBird and Hookdeck are not part of the production architecture. Downstream credentials remain in Koyeb Secrets, public manual execution is disabled by default, and operational status responses do not expose credentials or full downstream request details.

Restrict ingress at the hosting/CDN layer wherever a service does not need general public access, keep service tokens independently scoped and rotated, and retain HIVE operational alerting so failed or unauthorised scheduling attempts remain observable.

See `.env.example`, `docs/OPERATIONS.md`, `docs/POWER_MANAGEMENT.md`, `docs/OPERATIONAL_ALERTING.md` and `SECURITY.md`.
