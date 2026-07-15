> **Document status:** Production reference
> **Last reviewed:** 30 June 2026
> **Operational authority:** Current repository README and `src/jobs.js`.

# Koyeb power management

AIMS and RAMS run on Koyeb eco instances billed per second of *running* time, not per
request. Left running 24/7 they cost the same whether they're idle or busy. MAST now
pauses and resumes both services on a schedule, calling Koyeb's own REST API directly
(`POST /v1/services/{id}/pause` and `/resume`) - this is separate from the AIMS/RAMS
application routes MAST also triggers.

## Schedule

**AIMS** - running window ~08:00-20:00 Europe/London, every day:

| Job | Schedule | Action |
| --- | --- | --- |
| `aims-power-resume-daily` | every day, 07:30 | resume (30 min warmup before the 08:00 job block) |
| `aims-power-pause-daily` | every day, 20:00 | pause |
| `aims-power-resume-monthly-audit` | 1st of month, 00:45 | resume early - the monthly audit chain starts at 01:00 and runs to ~08:10, well ahead of the normal 07:30 resume |

**RAMS** - running window ~04:00-16:00 Europe/London, 1st of the month only:

| Job | Schedule | Action |
| --- | --- | --- |
| `rams-power-resume-monthly` | 1st of month, 04:00 | resume (30 min before the 04:30 rebuild sequence starts) |
| `rams-power-pause-monthly` | 1st of month, 16:00 | pause (RAMS's last scheduled job finishes by 08:10; this leaves a wide margin for manual reruns before pausing) |

RAMS stays paused every other day of the month. AIMS stays paused 20:00-07:30 daily.

## Why the daily zernio jobs moved

The daily `zernio-*` content-queue jobs and `zernio-weekly-quiz` previously ran at
23:15/23:20 Europe/London - outside any reasonable AIMS running window. They've been
moved to 19:30/19:35 (same day-before-publish timing, just earlier) so AIMS can pause at
20:00 without missing them. No other job behaviour changed.

## Required configuration

- `KOYEB_TOKEN` - already used for the deployment watcher, but that only needs read
  access to list deployments. Confirm/upgrade the token to `services:write` scope before
  enabling power management, or pause/resume calls will fail with 403s.
- `KOYEB_SERVICE_ID_AIMS`, `KOYEB_SERVICE_ID_RAMS` - Koyeb **service IDs**, not service
  names. Find them via `koyeb services get <name>` or the service settings page in the
  Koyeb dashboard.
- `KOYEB_POWER_MANAGEMENT_ENABLED` - defaults to `true`. Set to `false` to disable the
  feature instantly without a redeploy (same pattern as `AIMS_PRETRIGGER_CHECKS_ENABLED`).

If a service ID env var isn't set, the relevant jobs still exist (so job counts and
`/status` stay stable) but point at a deliberately invalid URL
(`.../services/UNSET-KOYEB_SERVICE_ID_AIMS/...`), which fails loudly in the run log and
review queue rather than silently doing nothing.

## Operational notes

- **Cold starts:** resume calls run with a buffer (30-60 min) ahead of the first job that
  needs the service warm. If either app's cold-start time grows, widen the buffer in
  `src/jobs.js` rather than the pause/resume times.
- **Manual RAMS checks:** `rams-health` and `rams-readiness` are manual-trigger jobs and
  won't wake RAMS up themselves - run `rams-power-resume-monthly`'s underlying Koyeb
  resume call (or resume the service in the Koyeb dashboard) before using them outside
  the 1st-of-month window.
- **Failures:** pause/resume jobs go through the same retry, failure-streak and review
  queue machinery as every other MAST job - repeated failures will surface in the
  operator review queue exactly like a failed AIMS/RAMS trigger.
- **Disabling:** set `KOYEB_POWER_MANAGEMENT_ENABLED=false` if you need AIMS or RAMS to
  stay up continuously for a while (e.g. active debugging) without touching the schedule
  definitions.
