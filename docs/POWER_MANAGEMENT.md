> **Document status:** Production reference
> **Last reviewed:** 3 August 2026
> **Operational authority:** Current repository README and `src/jobs.js`.

# Koyeb power management

MAST controls the Koyeb lifecycle for AIMS and RAMS by calling Koyeb's service
`resume` and `pause` endpoints. A successful pause is recorded as **standby** in the
MAST lifecycle ledger.

## Normal weekday schedule

| Event | Europe/London | Behaviour |
| --- | ---: | --- |
| AIMS weekday wake | 09:30 Monday-Friday | Resume AIMS and allow a 30-minute warm-up. The 120-minute catch-up window prevents a brief scheduler outage from losing the wake. |
| AIMS morning operations | 10:00 Monday-Friday | Trigger `/ops/run/<day>-am`. AIMS processes the full morning sequence. The 180-minute catch-up window protects the daily fire. |
| AIMS morning standby | completion-driven | Pause AIMS immediately after the morning operation endpoint returns successfully. |
| Friday podcast wake | 14:30 Friday | Resume AIMS for the podcast-only window, with a 120-minute catch-up window. |
| Friday podcast | 15:00 Friday | Trigger `/ops/run/friday-pm`, which runs podcast readiness followed immediately by `/podcast/run`; the 180-minute catch-up window prevents a missed fire after a restart. |
| Friday podcast standby | one hour after completion | MAST waits for the podcast child job to finish, then pauses AIMS one hour later. |

There are no Monday-Thursday PM operation windows. Friday AM prepares both scheduled
Blotato posts and the Saturday/Sunday Zernio content. Friday afternoon is reserved for
the podcast pipeline.

## Governed audit windows

The first-Sunday website audit and second-Saturday AIMS audit retain their governed
wake sequence. AIMS and RAMS pause one hour after the relevant audit pipeline finishes,
allowing final reports and remediation state to settle.

## Completion-driven standby

Normal weekday pause jobs use `posttrigger` schedules linked to the successful result of
the corresponding operation job. MAST polls `/ops/jobs/:id`, so a `202 Accepted` response
from the operation trigger is not considered completion. The scheduler derives the pause run key from the source
job's completion timestamp, which prevents duplicate pause calls while allowing the next
day's completed operation to create a new standby action.

If an operation ends as `failed` or `completed-with-failures`, MAST does not treat the HTTP status poll as success and does not trigger automatic standby. The failure remains visible through normal failure
streak and review-queue handling.

## Future Comms Hub wake control

AIMS remains in standby outside the governed operation windows. When the Comms Hub is
implemented, its controlled flow will request additional AIMS wake periods for inbound
communications. MAST should not invent a permanent always-on window for that service.

## Required configuration

- `KOYEB_TOKEN` with `services:write` permission.
- `KOYEB_SERVICE_ID_AIMS` and `KOYEB_SERVICE_ID_RAMS` using Koyeb service IDs.
- `KOYEB_POWER_MANAGEMENT_ENABLED=true` to enable lifecycle control.
- `MAST_AM_WAKE_TIME=09:30`.
- `MAST_AM_OPERATION_TIME=10:00`.
- `MAST_AM_WAKE_CATCH_UP_MINUTES=120`.
- `MAST_AM_OPERATION_CATCH_UP_MINUTES=180`.
- `MAST_FRIDAY_PM_WAKE_TIME=14:30`.
- `MAST_FRIDAY_PM_OPERATION_TIME=15:00`.
- `MAST_FRIDAY_PM_WAKE_CATCH_UP_MINUTES=120`.
- `MAST_FRIDAY_PM_OPERATION_CATCH_UP_MINUTES=180`.

Set `KOYEB_POWER_MANAGEMENT_ENABLED=false` during deliberate maintenance when AIMS or
RAMS must remain continuously available.
