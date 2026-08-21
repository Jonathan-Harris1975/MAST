> **Document status:** Production reference
> **Last reviewed:** 21 August 2026
> **Operational authority:** Current repository README and `src/jobs.js`.

# Koyeb power management

AIMS and HIVE are **always-on production services**. AIMS hosts Comms Hub's continuous inbound, delayed-action, backup, retention and follow-up workers. HIVE receives operational events and performs governance/alert duties. MAST therefore never schedules pause/resume jobs for either service.

RAMS remains demand-managed because its work is bounded remediation/audit processing. MAST resumes RAMS before the first-Sunday website audit and second-Saturday AIMS/content audit, readiness-gates the parent audit on both AIMS and RAMS, and pauses RAMS one hour after terminal completion.

## Normal weekday automation

| Event | Europe/London | Behaviour |
| --- | ---: | --- |
| Outreach AM | 09:00 Monday-Friday | MAST calls `/outreach/batch/next` on always-on AIMS. |
| AIMS morning operations | 10:00 Monday-Friday | MAST triggers `/ops/run/<day>-am`; AIMS runs the complete RSS/Blotato/Zernio/blog/newsletter sequence. |
| Friday podcast | 15:00 Friday | MAST triggers `/ops/run/friday-pm`; AIMS performs readiness then `/podcast/run`. |
| Outreach PM | 16:00 Monday-Friday | MAST calls the second bounded Outreach batch. |

There are no AIMS standby windows. Blotato provider publication times remain owned by AIMS/Blotato scheduling logic rather than additional MAST clocks.

## Governed audit windows

- First Sunday: RAMS resumes at 10:00 and the website audit runs at 10:30.
- Second Saturday: RAMS resumes at 09:00 and the AIMS/content master audit runs at 09:15.

AIMS and HIVE remain online throughout. RAMS pause is completion-driven.

## Required configuration

- `KOYEB_TOKEN` with `services:write` permission for RAMS lifecycle control and operator recovery.
- `KOYEB_SERVICE_ID_AIMS`, `KOYEB_SERVICE_ID_RAMS`, and `KOYEB_SERVICE_ID_HIVE` for readiness/operator lifecycle integration.
- `KOYEB_POWER_MANAGEMENT_ENABLED=true` to enable RAMS demand management.
- `AIMS_API_KEY`, `RMS_API_KEY`, and `HIVE_ADMIN_BEARER_TOKEN` for authenticated automation.
