# MAST Blotato Hookdeck Schedule Update

## Changed files

- `.env.example`
  - Adds the five `HOOK_BLOTATO_*_PUBLISH` environment variables for the new Blotato Hookdeck endpoints.

- `src/jobs.js`
  - Adds five protected Blotato weekday video jobs.
  - Schedules:
    - Monday 19:45 Europe/London: `news-insight`
    - Tuesday 18:45 Europe/London: `model-verdict`
    - Wednesday 18:45 Europe/London: `ai-at-work`
    - Thursday 18:45 Europe/London: `reality-check`
    - Friday 15:45 Europe/London: `ai-playbook`
  - Each job uses `AIMS_API_KEY` bearer auth like the other protected AIMS jobs.
  - Each job can be routed through Hookdeck by setting its `HOOK_BLOTATO_*_PUBLISH` env var.
  - Direct AIMS publish-now URLs remain as source fallbacks if an env override is not set.

- `test/scheduler.test.js`
  - Updates the expected job count.
  - Adds due-time assertions for all five Blotato video jobs.
  - Existing auth loop now also proves the Blotato jobs are protected by `AIMS_API_KEY`.

- `README.md`
  - Documents the Blotato weekly video schedule.
  - Adds the five new job IDs.
  - Notes that Hookdeck URLs should be supplied via the `HOOK_BLOTATO_*_PUBLISH` variables.

## Validation

- `npm run check`
- `npm test`
