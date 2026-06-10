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
| RSS rewrite | Daily at 08:00 |
| Outreach batch | Monday to Friday at 09:30 |
| Podcast pipeline | Friday at 15:00 |
| Weekly blog build | Monday at 12:00 |
| Daily social blog build | Daily at 09:30 |
| OneUp daily posts | Previous evening at 23:15 |
| Weekly quiz | Sunday at 23:20 |
| Monthly SEO/AEO/GEO source audit | 1st at 01:00 London |
| Monthly mobile UX source audit | 1st at 01:10 London |
| Monthly on-brand audit | 1st at 02:00 London |
| Monthly podcast website episode/transcript reports | 1st at 02:20 London |
| Monthly Zernio social-performance report with thumbnail evidence | 1st at 02:40 London |
| Monthly brand/social council report | 1st at 03:10 London |
| Monthly SEO/AEO/GEO council report | 1st at 06:00 London |
| Monthly mobile UX council report | 1st at 06:20 London |
| RAMS rebuild/report fetches | 1st, staggered after council reports |
| Weekly ebook posts | Monday at 08:00 London time |
| AIMS pretrigger checks | Automatically at T-3h, T-2h, and T-30m before each timed AIMS job |
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
| `REQUEST_TIMEOUT_MS` | `300000` | Upper bound for each trigger request. AIMS audit/report endpoints now return `202 Accepted` quickly, so Hookdeck should not wait on long report generation. |
| `REQUEST_RETRIES` | `4` | Retries non-OK/failed requests with a short backoff. |
| `BETWEEN_JOBS_MS` | `1500` | Small delay between multiple due jobs. |
| `STATE_FILE` | `/tmp/koyeb-cron-control-state.json` | Prevents duplicate runs inside the same schedule window. |
| `AIMS_BASE_URL` | `https://app.jonathan-harris.online` | Direct AIMS base URL for generated pretrigger checks. |
| `AIMS_PRETRIGGER_CHECKS_ENABLED` | `true` | Creates T-3h/T-2h/T-30m checks for timed AIMS jobs. |
| `CRON_ADMIN_TOKEN` | empty | Required for manual `/run/:jobId` and `/tick` endpoints. |
| `AIMS_API_KEY` | empty | Sent by MAST as `Authorization: Bearer ...` for AIMS jobs. The old blind health ping remains manual-only; generated T-3h health checks remain unauthenticated, while preflight and warmup checks use the AIMS bearer token. |
| `RMS_API_KEY` | empty | Sent by MAST as `Authorization: Bearer ...` for RAMS readiness, rebuild, and report jobs. RAMS health remains unauthenticated. |

The Hookdeck URLs are preserved as source fallbacks so this is ready to deploy. You can override any of them with the `HOOK_*` variables in `.env.example`. Bearer auth is added by MAST at request time, not configured inside Hookdeck.

## Event-aware AIMS pretrigger checks

MAST now creates three lightweight checks before every timed AIMS job:

| Offset | Endpoint | Purpose |
|---|---|---|
| T-3h | `GET /ops/health` | Confirm AIMS is awake and the target service is known. |
| T-2h | `GET /ops/preflight` | Check the target service context and obvious configuration warnings. |
| T-30m | `GET /ops/warmup` | Warm the service path with a bounded readiness check before the real trigger. |

These checks are generated from the actual job schedule. If `blog-daily-social-build` moves from 10:00 to 09:00, its T-3h, T-2h, and T-30m checks move automatically. The old blind 45-minute AIMS keepalive is now a manual fallback job, not a repeating interval.

Useful controls:

| Variable | Default | Notes |
|---|---:|---|
| `AIMS_BASE_URL` | `https://app.jonathan-harris.online` | Direct AIMS base used by pretrigger checks. |
| `AIMS_PRETRIGGER_CHECKS_ENABLED` | `true` | Set to `false` to disable generated checks without deleting schedules. |

## Monthly audit jobs

MAST runs every audit/report input on the **1st of the month**, deliberately staggered so the council reports have their source data available before they build. Long-running AIMS report routes return `202 Accepted` and continue in the AIMS job store, which prevents Hookdeck from sitting on a request until it times out.

| Order | Job ID | Schedule | Purpose | Destination |
|---:|---|---|---|---|
| 1 | `seo-aeo-geo-audit` | 1st, 01:00 London | Dispatch source SEO/AEO/GEO workflow | `/audits/seo-aeo-geo/run` |
| 2 | `mobile-audit` | 1st, 01:10 London | Dispatch source Mobile UX workflow | `/audits/mobile-ux/run` |
| 3 | `on-brand-audit` | 1st, 02:00 London | Build brand QA report | `/audits/on-brand/run` |
| 4 | `podcast-website-report` | 1st, 02:20 London | Build podcast episode and transcript reports | `/audits/podcast-website/run` |
| 5 | `social-performance-audit` | 1st, 02:40 London | Build Zernio social report with thumbnail evidence | `/audits/social-performance/run` |
| 6 | `brand-social-council-report` | 1st, 03:10 London | Build master brand/social council report after brand, social, podcast and transcript inputs exist | `/audits/brand-social-council/run` |
| 7 | `seo-aeo-geo-council-report` | 1st, 06:00 London | Build SEO/AEO/GEO council fallback/report from latest website audit evidence | `/audits/seo-aeo-geo-council/run` |
| 8 | `mobile-ux-council-report` | 1st, 06:20 London | Build Mobile UX council fallback/report from latest rendered evidence | `/audits/mobile-ux-council/run` |

The SEO/AEO/GEO and Mobile UX callbacks still queue their councils when source workflows complete. The explicit 06:00 and 06:20 council jobs are a belt-and-braces monthly report guarantee, not a second patch trigger.


## Blotato weekly social-video jobs

MAST triggers five Blotato publish-now lanes through Hookdeck. Each job sends the AIMS bearer token at request time.

| Job ID | Lane | Schedule | Hook env | Hookdeck URL fallback | AIMS destination |
|---|---|---|---|---|---|
| `blotato-news-insight-publish` | `news-insight` | Monday 19:45 Europe/London | `HOOK_BLOTATO_NEWS_INSIGHT_URL` | `https://hooks.jonathan-harris.online/g7ncsqagt2wqyq` | `/blotato/shorts/news-insight/publish-now` |
| `blotato-model-verdict-publish` | `model-verdict` | Tuesday 18:45 Europe/London | `HOOK_BLOTATO_MODEL_VERDICT_URL` | `https://hooks.jonathan-harris.online/rsy7vh21t8un6c` | `/blotato/shorts/model-verdict/publish-now` |
| `blotato-ai-at-work-publish` | `ai-at-work` | Wednesday 18:45 Europe/London | `HOOK_BLOTATO_AI_AT_WORK_URL` | `https://hooks.jonathan-harris.online/5cfbla6oubngjw` | `/blotato/shorts/ai-at-work/publish-now` |
| `blotato-reality-check-publish` | `reality-check` | Thursday 18:45 Europe/London | `HOOK_BLOTATO_REALITY_CHECK_URL` | `https://hooks.jonathan-harris.online/fl60oupriujf53` | `/blotato/shorts/reality-check/publish-now` |
| `blotato-ai-playbook-publish` | `ai-playbook` | Friday 15:45 Europe/London | `HOOK_BLOTATO_AI_PLAYBOOK_URL` | `https://hooks.jonathan-harris.online/lbed1dhtigdmjf` | `/blotato/shorts/ai-playbook/publish-now` |

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
social-performance-audit
oneup-ebooks-weekly
suite-health-ping (manual fallback only)
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

## HIVE keep-awake job

This build adds a lightweight `hive-keepawake` interval job for the current HIVE deployment on Koyeb's free web service. It pings HIVE's unauthenticated `/healthz` endpoint on a gentle interval so HIVE is less likely to be asleep when ops work starts.

Recommended env:

```env
HIVE_KEEPAWAKE_URL=https://liable-loreen-jonathanharris-57884580.koyeb.app/healthz
HIVE_KEEPAWAKE_EVERY_MINUTES=10
```

The job uses no bearer token and should remain a tiny liveness ping only.
