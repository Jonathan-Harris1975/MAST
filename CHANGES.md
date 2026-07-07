> **Document status:** Production reference  
> **Last reviewed:** 16 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# Changelog

## HIVE ecosystem governance jobs — 7 July 2026

- MAST previously orchestrated AIMS and RAMS in depth but only pinged HIVE's `/healthz` (`hive-keepawake`). HIVE itself exposes admin-authenticated diagnostic/report endpoints (repo health, environment audit, provider health, skill-catalogue integrity, Vectorize/R2/connector diagnostics, Model Registry, AI Council, optimisation stats) that nothing outside a human opening HIVE-UI ever called.
- Added 16 new jobs, group-prefixed `hive-*`, all authenticating with a new `HIVE_ADMIN_BEARER_TOKEN` (distinct from `AIMS_API_KEY`/`RMS_API_KEY`, matching HIVE's own single-token `ADMIN_BEARER_TOKEN` auth):
  - Daily 06:00-06:15 Europe/London: `hive-readiness-check`, `hive-repo-health-check`, `hive-provider-health-check`, `hive-ops-events-digest`.
  - Weekly (Monday) 06:25-06:55: `hive-env-audit`, `hive-repo-hygiene-check`, `hive-skills-integrity-check`, `hive-vectorize-diagnostics`, `hive-buckets-check`, `hive-connectors-check`, `hive-model-registry-snapshot`.
  - Monthly (1st) 07:00-07:16, ahead of the existing 07:30 AIMS resume: `hive-ai-council-run` (POST, the one mutating job in this set), `hive-skills-duplicates-check`, `hive-skills-orphans-check`, `hive-skills-missing-check`, `hive-optimisation-stats-snapshot`.
- All 16 are read-only GETs except `hive-ai-council-run`, which was already a fully automatic, self-contained POST endpoint in HIVE (no approval gate) that refreshes provider model catalogues and can auto-promote into the Model Registry.
- Deliberately **not** scheduled: any repository-scoped HIVE endpoint (`POST /repositories/{id}/council`, `/qa`, `/reindex`, memory writes). Those depend on a repository already being uploaded into HIVE's repository registry within the same process lifetime, and that registry is in-memory only (not database-backed yet), so a cron call against it would silently 404 or run against nothing after any restart/idle cycle. Scheduling them now would look like automation while actually being a correctness regression; see `docs/HIVE-ORCHESTRATION-REPORT.md` for the full gap analysis.
- New env vars: `HIVE_BASE_URL` (defaults to `https://hive.jonathan-harris.online`), `HIVE_ADMIN_BEARER_TOKEN`.
- Updated `test/scheduler.test.js`: job counts (57 base / 138 total), explicit coverage of every new `hive-*` job's id/auth/method, and a standing guard test that fails if any repository-scoped HIVE endpoint is ever added to the schedule.
- No existing job was removed, renamed, retimed, or had its schedule/body changed.

## RAMS monthly sequence moved fully inside the 8am-8pm window — 2 July 2026

- Removed `aims-power-resume-monthly-audit`: the monthly audit chain runs at 15:00-18:20, already inside the normal 07:30-20:00 daily resume/pause window, so the extra 00:45 resume was paying for ~7 hours of unnecessary idle billing every month for no job that needed it.
- Moved the RAMS rebuild/report sequence from ~04:30-08:10 to 08:30-12:10 Europe/London, and moved `rams-power-resume-monthly`/`rams-power-pause-monthly` from 04:00/16:00 to 08:00/20:00, so RAMS's once-a-month tasks run entirely within the same 08:00-20:00 boundary as AIMS instead of overnight.
- Updated `test/scheduler.test.js` to match: job counts (41 base / 122 total), the monthly due-time cases, and the power-management checkpoints.
- Updated `docs/POWER_MANAGEMENT.md` accordingly.

## Koyeb power management for AIMS and RAMS — 30 June 2026

- Added five new jobs (`aims-power-resume-daily`, `aims-power-pause-daily`, `aims-power-resume-monthly-audit`, `rams-power-resume-monthly`, `rams-power-pause-monthly`) that call Koyeb's pause/resume API directly to stop billing AIMS and RAMS for idle time.
- AIMS now runs ~08:00-20:00 Europe/London daily, with an extra early resume at 00:45 on the 1st to cover the monthly audit chain (01:00-08:10).
- RAMS now runs ~04:00-16:00 Europe/London on the 1st of the month only; paused the rest of the month.
- Moved the daily `oneup-*` jobs and `oneup-weekly-quiz` from 23:15/23:20 to 19:30/19:35 so they fall inside the new AIMS running window.
- New env vars: `KOYEB_POWER_MANAGEMENT_ENABLED`, `KOYEB_SERVICE_ID_AIMS`, `KOYEB_SERVICE_ID_RAMS`. Requires `KOYEB_TOKEN` to carry `services:write` scope (the existing deployment-watch usage only needed read access).
- See [`docs/POWER_MANAGEMENT.md`](docs/POWER_MANAGEMENT.md) for the full schedule and rollout notes.

## 1.1.0 — 16 June 2026

- Added production health, liveness, readiness and compact status contracts.
- Protected detailed status and job registry routes.
- Added request IDs, secure headers, bounded bodies and graceful shutdown.
- Added non-root container, CI, tests and production documentation.


## Event-aware AIMS pretrigger checks

- Replaced the blind repeating AIMS health ping with generated pretrigger checks.
- MAST now creates T-3h `/ops/health`, T-2h `/ops/preflight`, and T-30m `/ops/warmup` checks for each timed AIMS job.
- The derived checks follow the source job schedule automatically, so changing a trigger time moves the checks without extra config.
- Kept `suite-health-ping` as a manual fallback job.

# MAST Blotato Hookdeck endpoint update

## Changed files

- `.env.example`
  - Added the five `HOOK_BLOTATO_*_URL` environment variables for the weekly Blotato social-video Hookdeck endpoints.

- `src/jobs.js`
  - Added five scheduled Blotato social-video jobs.
  - Wired each job to the supplied Hookdeck source URL as the fallback target.
  - Kept the matching AIMS `/blotato/shorts/<lane>/publish-now` endpoint documented as `targetUrl`/`targetPath`.
  - Kept bearer auth on all five jobs through `AIMS_API_KEY`.

- `test/scheduler.test.js`
  - Updated the expected job count from 26 to 31.
  - Added assertions for the five Hookdeck URLs, env names, AIMS target paths, and bearer-auth configuration.
  - Added schedule assertions for the five weekly publish windows.

- `README.md`
  - Documented the five Blotato weekly social-video jobs, Hookdeck fallbacks, env names, schedules, and AIMS destinations.

## Validation

- `npm run check`
- `npm test`

Both passed.


# MAST Zernio social-performance monthly report update

## Changed files

- `.env.example`
  - Added `HOOK_AUDIT_SOCIAL_PERFORMANCE` for the optional Hookdeck override.

- `src/jobs.js`
  - Added the `social-performance-audit` job.
  - Scheduled it for the 1st of each month at 05:00 UTC, after SEO/AEO/GEO, on-brand, and mobile UX audits.
  - Pointed the fallback directly at `https://app.jonathan-harris.online/audits/social-performance/run`.
  - Kept bearer auth through `AIMS_API_KEY`.

- `test/scheduler.test.js`
  - Updated the expected job count from 31 to 32.
  - Added route, auth, schedule, and fallback assertions for the social-performance job.
  - Brought outdated schedule assertions back into line with the current job definitions.

- `README.md`
  - Documented the monthly Zernio social-performance job and the updated monthly audit order.

## Validation

- `npm run check`
- `npm test`

Both passed.

## Monthly audit/council sequencing and Hookdeck timeout hardening

- Moved every monthly audit/report/council trigger onto the 1st of the month.
- Added explicit MAST jobs for podcast website reports, brand/social council, SEO/AEO/GEO council, and Mobile UX council.
- Staggered RAMS rebuild/report pulls on the 1st after the relevant council reports are scheduled.
- Increased trigger retry tolerance and documented that AIMS long-running audit routes now acknowledge quickly with `202 Accepted`.
- Added Hookdeck override variables for the new audit/council jobs.
- Restored generated AIMS pretrigger health/preflight/warmup checks for all timed AIMS jobs.

## HIVE keep-awake support

- Added `hive-keepawake` interval job.
- Default target: HIVE `/healthz`.
- Default interval: 10 minutes, configurable with `HIVE_KEEPAWAKE_EVERY_MINUTES`.
- Intended for Koyeb free web-service keep-awake behaviour without hitting heavier authenticated endpoints.
