> **Document status:** Production reference
> **Operational authority:** Current repository README and `src/jobs.js`.

# Koyeb power management

MAST resumes AIMS at 09:00 Europe/London on weekdays. AM operations begin after warm-up at the configured AM operation time. Monday-Thursday have no PM operation window: AIMS schedules both Blotato posts during the AM run and pauses one hour after that AM window completes.

Friday AM also prepares Saturday and Sunday Zernio content. Friday PM triggers only the podcast pipeline, and AIMS pauses one hour after the podcast run completes.

For governed audits, AIMS and RAMS resume on the first Saturday for the Website audit and the second Saturday for the AIMS audit. Each service pauses one hour after the relevant audit/remediation sequence completes.

## Required configuration

- `KOYEB_TOKEN` with service write permission
- `KOYEB_SERVICE_ID_AIMS`
- `KOYEB_SERVICE_ID_RAMS`
- `KOYEB_POWER_MANAGEMENT_ENABLED`
- `MAST_AM_OPERATION_TIME`
- `MAST_FRIDAY_PM_OPERATION_TIME`

Power jobs use the same retry, failure-streak and review-queue handling as other MAST jobs.
