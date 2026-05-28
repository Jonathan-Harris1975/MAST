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
