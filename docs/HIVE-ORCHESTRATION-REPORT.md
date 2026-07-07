> **Document status:** Production reference
> **Last reviewed:** 7 July 2026
> **Scope:** MAST v1.2.0 — HIVE ecosystem governance jobs

# HIVE Ecosystem Orchestration Report

## 1. What changed and why

Before this change, MAST orchestrated AIMS (content pipeline) and RAMS (remediation/reports)
in real depth — weekly/monthly schedules, pretrigger health/preflight/warmup checks, Koyeb
power management — but HIVE only got a single `hive-keepawake` interval ping against
`/healthz`. Every other HIVE capability (AI Council, repo health, environment audit, skill
catalogue checks, provider monitoring, Model Registry, optimisation stats, connectors,
buckets, Vectorize diagnostics) existed only as an admin-authenticated API endpoint that
nothing called unless a human opened HIVE-UI.

This release adds 16 new jobs that put HIVE's own governance surface on the same schedule
discipline as AIMS/RAMS, without touching a single existing job, time, body, or ID.

## 2. Discovery method

HIVE's actual automatable surface was read directly from its FastAPI routers
(`backend/app/api/*.py`), not assumed from the brief's example list. Two categories emerged:

**Schedulable now — self-contained, no per-session state required:**

| Domain | Endpoint | New job |
|---|---|---|
| Runtime readiness | `GET /v1/runtime/readiness` | `hive-readiness-check` |
| Repository Health Review | `GET /system/repo-health` | `hive-repo-health-check` |
| AI Provider Monitoring | `GET /providers/health` | `hive-provider-health-check` |
| Ops event trail | `GET /system/ops-events` | `hive-ops-events-digest` |
| Environment Validation | `GET /environment/audit` | `hive-env-audit` |
| Repository hygiene | `GET /system/repo-hygiene` | `hive-repo-hygiene-check` |
| Knowledge Base Review (skill catalogue) | `GET /skills/integrity` | `hive-skills-integrity-check` |
| R2/Vectorize Storage Validation | `GET /vectorize/diagnostics` | `hive-vectorize-diagnostics` |
| Bucket lane validation | `GET /buckets` | `hive-buckets-check` |
| Connector status | `GET /connectors` | `hive-connectors-check` |
| Model Registry snapshot | `GET /model-registry` | `hive-model-registry-snapshot` |
| **AI Models Council** | `POST /ai-council/run` | `hive-ai-council-run` |
| Skill catalogue deep checks | `GET /skills/duplicates`, `/orphans`, `/missing` | 3 jobs |
| Executive reporting input | `GET /optimisation/stats` | `hive-optimisation-stats-snapshot` |

**Discovered but deliberately not scheduled:** every repository-scoped HIVE endpoint
(`POST /repositories/{id}/council`, `/qa`, `/reindex`, memory writes). `repository_manager.py`
keeps registered repositories in an in-process dictionary with no database backing — a
repository only exists in that registry if it was uploaded earlier in the same process
lifetime. A cron job calling `/repositories/hive/council` on a schedule would 404 (or run
against nothing) the moment Koyeb restarts or the process idles, which is often. Scheduling
these now would look like coverage while actually being unreliable automation dressed up as
a feature. This is the same in-memory-registry gap already flagged as unresolved for the
Model Registry — closing it (SQL/D1-backed repository + model registries) is the real
prerequisite for automating repo-level council/QA/reindex runs, not a scheduler change.

Most of the brief's example list (SEO Council, Mobile UX Council, Brand Council, Lighthouse,
Core Web Vitals, Search Console, sitemap/robots/OpenGraph/Twitter Card validation, dead-link
review, podcast/social/blog reviews) is **not** HIVE surface at all — it's already
orchestrated through `monthlyAuditJobs` and `ramsJobs` against AIMS (`app.jonathan-harris.online`)
and RAMS (`mod.jonathan-harris.online`). Those were left untouched; re-adding them against HIVE
would create duplicate, conflicting schedules for work already owned elsewhere.

## 3. Schedule placement and dependency ordering

All new jobs sit in a previously-empty 06:00-07:16 Europe/London window, ahead of the
existing 07:30 AIMS resume and hours ahead of the 15:00-18:20 monthly audit sequence, so they
never contend with AIMS/RAMS work for Koyeb capacity or scheduler tick budget:

- **Daily** 06:00 → 06:15, 5 minutes apart: readiness → repo health → provider health → ops
  events. Ordered cheapest/fastest-first; each is an independent GET with no inter-job data
  dependency, so order only matters for even spacing.
- **Weekly** (Monday) 06:25 → 06:55, 5 minutes apart: env audit → repo hygiene → skill
  integrity → Vectorize → buckets → connectors → Model Registry snapshot.
- **Monthly** (1st) 07:00 → 07:16: AI Council first (the only job here with real work to do —
  provider discovery, catalogue refresh, scoring, possible promotion), then the three deeper
  skill-catalogue checks, then the optimisation-stats snapshot that feeds executive reporting.

HIVE is never paused/resumed by Koyeb power management (unlike AIMS/RAMS) — it's kept warm by
the existing `hive-keepawake` interval job — so no new power-management jobs were needed for
these checks to succeed.

No circular dependencies exist: every new job is a standalone read (or, for AI Council, a
self-contained write) with no `sourceJobId`/pretrigger relationship, and none of them feed a
downstream MAST job's request body.

## 4. Production hardening checklist

| Check | Result |
|---|---|
| Duplicate job IDs | None (`node` load-check against `jobs.js`: 0 duplicates across 138 jobs) |
| Duplicate/conflicting schedules | None — new window (06:00-07:16) doesn't overlap any existing job |
| Orphaned/disabled/stale jobs | None found in the existing set; nothing removed per the brief |
| Cron/schedule syntax | Uses the existing `weekly`/`monthly`/`interval` schedule shape only — no new schedule type introduced |
| Auth wiring | All 16 use `authEnv: "HIVE_ADMIN_BEARER_TOKEN"`, verified via `buildRequestHeaders` |
| Idempotency | GETs are naturally idempotent; `hive-ai-council-run` is idempotent at the MAST layer via the existing per-minute `runKey` (won't double-fire within the same scheduled minute) — repeat *manual* triggers are HIVE's own concern, unchanged by this release |
| Logging/telemetry | Uses MAST's existing structured JSON job-started/finished/failed logging and failure-streak review queue — no new logging path added |
| Retry/timeout policy | Uses the existing shared `CONFIG` (retries, timeout, between-jobs spacing) — no per-job override needed or added |

## 5. Validation performed vs. validation that requires live secrets

Verified in this sandbox (no network egress, so live HTTP calls to Koyeb-hosted services were
not possible):

- `jobs.js` loads cleanly and produces the expected 57 base / 138 total jobs with zero
  duplicate IDs.
- Every new job's shape (method, path, schedule, `authEnv`) was checked programmatically.
- Every referenced HIVE route (`/v1/runtime/readiness`, `/system/repo-health`, `/providers/health`,
  `/system/ops-events`, `/environment/audit`, `/system/repo-hygiene`, `/skills/integrity`,
  `/skills/duplicates`, `/skills/orphans`, `/skills/missing`, `/vectorize/diagnostics`,
  `/buckets`, `/connectors`, `/model-registry`, `/ai-council/run`, `/optimisation/stats`) was
  confirmed to exist in `backend/app/api/*.py` at the exact path used.
- `test/scheduler.test.js` was updated to match and extended with explicit coverage for every
  new job plus a standing guard against ever scheduling a repository-scoped endpoint.

**Not verifiable from here, and flagged rather than assumed:**

- `npm test` (Node's built-in test runner, not vitest) could not actually be executed in this
  sandbox: `@aws-sdk/client-s3` isn't installed and there's no network access to `npm install`
  it. The `jobs.js` changes were validated directly (dependency-free of that package); the
  full `scheduler.test.js` run against real `scheduler.js` behaviour still needs `npm ci &&
  npm test` in CI or locally before merge.
- Whether `HIVE_ADMIN_BEARER_TOKEN` actually matches HIVE's deployed `ADMIN_BEARER_TOKEN` —
  this needs to be set as a Koyeb secret on the MAST service before the first `hive-*` job
  fires, or every one of them will fail with "Missing HIVE_ADMIN_BEARER_TOKEN" at job-start
  (a deliberate loud failure, matching the existing pattern used for AIMS/RAMS auth).
- Real HTTP reachability of `https://hive.jonathan-harris.online` from MAST's Koyeb network
  context.

## 6. Environment variables added

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `HIVE_BASE_URL` | No | `https://hive.jonathan-harris.online` | Base URL for all `hive-*` governance jobs |
| `HIVE_ADMIN_BEARER_TOKEN` | Yes (or all `hive-*` jobs fail loudly) | — | Must equal HIVE's own `ADMIN_BEARER_TOKEN` secret |

## 7. Recovery procedure

If a `hive-*` job hits `MAST_FAILURE_REVIEW_THRESHOLD` (default 3) consecutive failures, it's
added to the existing operator review queue and a `repeated_job_failure` operational event
fires — identical handling to any AIMS/RAMS job failure. First checks for a failing `hive-*`
job:

1. Confirm `HIVE_ADMIN_BEARER_TOKEN` on MAST matches `ADMIN_BEARER_TOKEN` on HIVE.
2. Hit `https://hive.jonathan-harris.online/healthz` manually — if that's down, it's a HIVE
   availability problem, not a MAST scheduling problem.
3. For `hive-ai-council-run` specifically: check `GET /ai-council/history` on HIVE for partial
   runs before assuming total failure — a slow provider catalogue refresh can time out at the
   MAST layer while still completing and recording to D1 on the HIVE side.

## 8. Follow-up work this report surfaces (not fixed here)

- Make HIVE's repository registry and Model Registry database-backed (D1/SQL) so
  repository-scoped council/QA/reindex jobs can be safely scheduled — currently the single
  biggest blocker to expanding HIVE automation coverage further.
- Once persistent, add a small fixed list of "always-registered" repositories (HIVE, MAST,
  AIMS, RAMS, website, image-redirect) that MAST could re-upload/re-register on a schedule
  before running per-repo council/QA checks against them.
