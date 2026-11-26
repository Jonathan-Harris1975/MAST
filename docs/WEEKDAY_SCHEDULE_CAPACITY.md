# MAST weekday capacity and collision policy

**Date:** 17 November 2026  
**Timezone:** Europe/London (DST-aware).  
**Authority:** `src/jobs.js`, `src/scheduler.js` and the Koyeb Worker effective environment.

## Evidence and scheduling decisions

Read-only production R2 observation: `metasystem/state/mast/scheduler-state.json` (17 November, 08:06 UTC). Its 80-entry rolling result history is **not** a comprehensive historical duration database. It showed Monday 16 November's weekly KDP public audit finishing in about 1.8 minutes, metadata sync in about 9.2 minutes, and a 10:00 AIMS content operation returning after 13.7 minutes with terminal content failures. The historical afternoon Outreach trigger returned 429 and was retired as part of the current three-session schedule. The Friday podcast now starts at 12:30 and the Friday Blotato AM backstop at 13:30, avoiding simultaneous launches.

Schedule changes preserve existing daily content generation, publishing controls, KDP research and print throughput. The primary AIMS content window stays at 10:00 and the Friday podcast at 12:30. The weekday workload has different service-level risk and must not be declared safe based on non-overlapping clock times alone.

## Target weekday starts

| Local time | Monday | Tuesday–Thursday | Friday |
| --- | --- | --- | --- |
| 02:00 | Cloudflare cache purge | Cloudflare cache purge | Cloudflare cache purge |
| 06:00–07:05 | HIVE daily plus weekly health/governance checks, staggered | HIVE daily checks, staggered | HIVE daily checks, staggered |
| 09:00 | Outreach AM | Outreach AM | Outreach AM |
| 10:00 | AIMS content creation; newsletter, Zernio, Blotato and blog tasks are internally ordered | Same | AIMS creation and weekend content preparation |
| 11:15 | AI Edge Zernio promo | Wednesday only | AI Edge Zernio promo |
| 12:00 | Weekly KDP public audit | KDP research (authenticated update slots do **not** start at 12:05) | No scheduled KDP research |
| 12:15 | KDP signed-in metadata synchronisation | — | — |
| 12:30 | — | — | Friday podcast operation |
| 13:00 | AM video recovery | AM video recovery | — |
| 13:30 | — | — | Friday AM video recovery |
| 13:05, 14:05 | KDP update verification | KDP update verification after research has started | KDP update verification plus Friday 12:05 recovery |
| 14:30 | Independent Zernio weekly mini-series | Thursday only: independent podcast social promotion | — |
| 15:20 | KDP update verification (moved from 16:05) | Same | Same |
| 15:30 | KDP print preflight | — | — |
| 15:45 | AIMS content recovery/backstop | Same | Same |
| 09:00 | Outreach | — | Outreach |
| 16:30 | Blotato PM backstop | Same | Same |
| 16:35, 18:35, 21:00 | Kindle royalty-floor reconciliation | Same | — |
| 17:15 | Late AM video recovery | Same | Same |
| 17:40, 19:40 | Published paperback/hardback price maintenance | Same | — |
| 17:00 | — | — | First podcast recovery |
| 19:00 / 19:30 | — | — | RAMS resume / monthly website or AIMS audit, first or second Friday only |
| 20:05 | KDP update verification | Same | Same |
| 21:15 / 21:20 | Late PM video recovery / content operation recovery | Same | Same |
| 22:15 | KDP print production, up to three books per night | Same | No existing-book print publishing |
| 18:00 | — | — | Final podcast recovery before 19:00 RAMS restart |

**Every day**, including weekends: KDP also has 13:05, 14:05, 15:20 and 20:05 verification. The 12:05 slot is now Friday–Sunday only. This avoids signing in at the start of Tuesday–Thursday's 12:00 research work while preserving in-window 13:05/14:05 recovery.

**Monthly exceptions:** first-day Communications Hub housekeeping starts at 04:00; first-Monday mailbox deletion starts at 06:00; Monday quarantine tidy starts at 08:00. The shared `aims-comms` execution lane prevents concurrent maintenance requests when the first day is a Monday or a job runs unusually long. HIVE monthly Council/governance starts on day 1 at 07:00, and the optimisation statistics snapshot now runs **15 minutes after verified terminal completion** instead of blindly at 07:16. First/second Friday RAMS wake and audit pairs move to 19:00 and 19:30 London time after the podcast slot. All other weekdays retain the same portfolio of independent tasks.

## Run-time non-overlap (not just cosmetic clock spacing)

All scheduled high-load AIMS work shares the `aims-heavy` execution lane across **different** job IDs: AIMS operating windows, content recovery, newsletter Zernio promotions, Blotato recovery, Outreach batches, monthly audits and KDP jobs. Another same-lane job is **deferred without a provider request** while a job is accepted but still being monitored. It can be retried at the next tick while its original catch-up window remains active; its schedule is **not** marked completed or falsely reported successful. A synchronous reservation closes the race when two non-blocking jobs become due in the same tick.

This protects the single MAST Worker and expensive AIMS pipelines, including long-running status-polled operations. It does **not** claim to be a distributed lock for a second independent MAST instance, nor to govern jobs started outside MAST. The downstream AIMS KDP lease and durable operation idempotency remain mandatory. Independent HIVE monitoring, infrastructure cache purge, and Comms Hub maintenance retain separate lanes so they are not starved by long publishing runs.

The operator status includes `activeExecutionLanes` and `pendingExecutionLanes` to explain any intentional delay. If another heavy job remains active past a dependent job's permitted local catch-up window, **the dependent run cannot be guaranteed to execute that day**. Its failure/recovery path must be addressed rather than running two unsafe sessions simultaneously.

## Effective production configuration

The MAST Koyeb environment may still contain legacy Friday audit clocks `11:30/12:00` (website) and `17:45/18:00` (AIMS). `collisionSafeAuditClock` maps **only those known legacy defaults** to the safe 19:00/19:30 slots so stale Koyeb configuration cannot silently restore the conflict. Any *different explicit* override is respected. `.env.example` and `MAST-KOYEB-PRODUCTION-ENV-PATCH.txt` also declare the new values; update the deployed Koyeb configuration to match during normal rollout.

**Acceptance:** CI `npm run verify`; staged scheduler tests for cross-job lane exclusion, independent HIVE progress, date-aware month/week triggers, and BST/GMT audit timing; confirm MAST Koyeb deploy source SHA and durable R2 heartbeat before asserting that the new schedule is live. Live AIMS terminal failures and HIVE 200 responses with `ok:false` are separate functional defects; moving them is not a fix.
