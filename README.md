# Koyeb Cron Control

Consolidated scheduler for the Jonathan Harris automation triggers.

This replaces the current Cloudflare cron-worker cluster with one small Koyeb service that stays alive, exposes health/status endpoints, and fires the existing Hookdeck triggers on the same business schedule.

## Why this design

The old setup was split across six Cloudflare Worker repos:

| Old worker | Jobs moved into this service |
|---|---|
| `Master-trigger-control--main` | RSS rewrite, outreach batch, podcast run, weekly blog build |
| `Master-trigger-control-1-main` | OneUp Monday to Thursday daily post preparation |
| `Master-trigger-control-2-main` | OneUp Friday to Sunday daily post preparation and weekly quiz |
| `Master-trigger-control-3-main` | Monthly SEO/AEO/GEO, on-brand, and mobile UX audits |
| `master-trigger-control-4-main` | Weekly ebook scheduler |
| `health-trigger-main` | AI suite health ping |

The new setup is deliberately boring: one Node process, one schedule list, one health endpoint, one set of logs. Less moving furniture in the haunted attic.

## Cost target

Recommended Koyeb instance: `eco-nano`.

The scheduler does not need CPU-heavy capacity because it mostly sends short HTTP requests to Hookdeck or direct service endpoints. The heavy work remains in AIMS and RAMS.

Avoid using a free Koyeb Web Service for this scheduler if you need reliable cron behaviour. Free Web Services can scale down after idle time, and free instances cannot be used as Worker Services.

## Schedules preserved

All times are based on `Europe/London` unless explicitly stated.

| Job | Schedule |
|---|---|
| RSS rewrite | Daily at 09:00 |
| Outreach batch | Monday to Friday at 09:30 |
| Podcast pipeline | Friday at 10:00 |
| Weekly blog build | Monday at 16:00 |
| Daily social blog build | Daily at 09:30 |
| OneUp daily posts | Previous evening at 23:15 |
| Weekly quiz | Sunday at 23:20 |
| Monthly audits | 1st of each month at 02:00 UTC |
| Weekly ebook posts | Monday at 08:00 London time |
| Blotato social videos | Monday 19:45, Tuesday to Thursday 18:45, Friday 15:45 |
| Health ping | Every 45 minutes |
| RAMS operator endpoints | Manual only via `/run/:jobId` |

Note on the ebook job: the old Cloudflare cron used `0 7 * * 1`, which means 08:00 during British Summer Time but 07:00 during GMT. This service makes the intent stable: Monday 08:00 Europe/London all year.

## Deployment on Koyeb

### Option A: GitHub repo deployment

1. Create a new private GitHub repo, for example `koyeb-cron-control`.
2. Upload these files.
3. In Koyeb, create a new **Web Service** from that repo.
4. Choose instance size `eco-nano`.
5. Set the start command:

```bash
npm start
```

6. Add the environment variables from `.env.example`.
7. Set `CRON_ADMIN_TOKEN` to a long random value.
8. Deploy.

### Option B: Docker deployment

This repo includes a Dockerfile. Koyeb can build it directly from GitHub.

## Important environment variables

| Variable | Default | Notes |
|---|---:|---|
| `SCHEDULER_ENABLED` | `true` | Set to `false` for a safe dry deployment. |
| `SCHEDULER_TICK_SECONDS` | `20` | Checks schedules every 20 seconds. |
| `REQUEST_TIMEOUT_MS` | `60000` | Timeout for each Hookdeck request. |
| `REQUEST_RETRIES` | `2` | Retries non-OK/failed requests. |
| `BETWEEN_JOBS_MS` | `1500` | Small delay between multiple due jobs. |
| `STATE_FILE` | `/tmp/koyeb-cron-control-state.json` | Prevents duplicate runs inside the same schedule window. |
| `CRON_ADMIN_TOKEN` | empty | Required for manual `/run/:jobId` and `/tick` endpoints. |
| `AIMS_API_KEY` | empty | Sent by MAST as `Authorization: Bearer ...` for AIMS jobs. Health pings remain unauthenticated. |
| `RMS_API_KEY` | empty | Sent by MAST as `Authorization: Bearer ...` for RAMS readiness, rebuild, and report jobs. RAMS health remains unauthenticated. |

The Hookdeck URLs are preserved as source fallbacks so this is ready to deploy. You can override any of them with the `HOOK_*` variables in `.env.example`. Bearer auth is added by MAST at request time, not configured inside Hookdeck.

For the Blotato weekday video lanes, set `HOOK_BLOTATO_*_PUBLISH` to the five Hookdeck endpoint URLs. The source fallback remains the direct AIMS publish-now endpoint so the job shape stays testable if Hookdeck routing is not configured yet.

## Public endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Koyeb health check. |
| `/jobs` | GET | Safe redacted job list and next run preview. |
| `/status` | GET | Current scheduler state and recent results. |
| `/tick` | POST | Manually scan for due jobs. Requires token. |
| `/run/:jobId` | POST | Manually run one job. Requires token. |

Manual run example:

```bash
curl -X POST "https://YOUR-KOYEB-URL/run/rss-rewrite" \
  -H "Authorization: Bearer YOUR_CRON_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force":true}'
```

Manual due-scan example:

```bash
curl -X POST "https://YOUR-KOYEB-URL/tick" \
  -H "Authorization: Bearer YOUR_CRON_ADMIN_TOKEN"
```

## Migration checklist

1. Deploy this Koyeb service with `SCHEDULER_ENABLED=false` first.
2. Check `/health`, `/jobs`, and `/status`.
3. Manually test one safe job with `/run/rss-rewrite` or a dry-run-friendly endpoint.
4. Set `SCHEDULER_ENABLED=true` and redeploy.
5. Disable the Cloudflare cron triggers after the Koyeb service is confirmed healthy.
6. Keep the old Cloudflare repos for a few days as rollback only, not active schedulers.

## Local checks

```bash
npm run check
npm test
npm start
```

Then open:

```text
http://localhost:8000/health
http://localhost:8000/jobs
http://localhost:8000/status
```

## Job IDs

```text
rss-rewrite
outreach-batch-next
podcast-run
blog-weekly-build
blog-daily-social-build
oneup-monday
oneup-tuesday
oneup-wednesday
oneup-thursday
oneup-friday
oneup-saturday
oneup-sunday
oneup-weekly-quiz
seo-aeo-geo-audit
on-brand-audit
mobile-audit
oneup-ebooks-weekly
suite-health-ping
rams-health
rams-readiness
rams-rebuild-seo-aeo-geo
rams-rebuild-mobile-ux
rams-rebuild-on-brand
rams-report-mobile-ux-latest
rams-report-seo-aeo-geo-latest
rams-report-on-brand-latest
blotato-news-insight-publish
blotato-model-verdict-publish
blotato-ai-at-work-publish
blotato-reality-check-publish
blotato-ai-playbook-publish
```
