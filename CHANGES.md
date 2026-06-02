
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
