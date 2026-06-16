> **Document status:** Production reference  
> **Last reviewed:** 16 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# Changelog

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
