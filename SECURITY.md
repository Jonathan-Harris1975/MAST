# MAST security policy

**Status:** Production-controlled
**Last reviewed:** 20 September 2026

MAST controls scheduled and manual triggers. Production manual routes require `CRON_ADMIN_TOKEN` and `ALLOW_PUBLIC_MANUAL_RUNS` must remain `false`. Production also requires durable R2 scheduler state; local/ephemeral state is development-only. Downstream AIMS and RAMS tokens are stored only in Koyeb Secrets.

MAST uses authenticated public HTTPS endpoints for AIMS, RAMS and HIVE. `AIMS_BASE_URL` is the single AIMS service origin and is validated as an origin-only URL before AIMS job construction; job paths cannot redirect execution onto another origin. NetBird and Hookdeck are not deployed. Production endpoint overrides must remain HTTPS, downstream bearer tokens must be independently scoped and rotated, and hosting/CDN ingress restrictions should be applied wherever a service does not require unrestricted public reachability.

Public health and compact status responses intentionally omit full endpoint URLs, tokens and request bodies. Detailed status and the job registry require admin authentication. Report suspected unauthorised scheduling or credential exposure privately to the repository owner.

Production scheduler state is stored in R2 so restarts do not erase run keys. Scope the token to the `metasystem` bucket and rotate it after suspected exposure.

CI scans the built production image, not merely the Dockerfile, with an immutably pinned Trivy action. It inspects OS and application-library content and fails for fixable `HIGH` or `CRITICAL` vulnerabilities. `ignore-unfixed` is deliberately enabled so an issue with no upstream remediation does not create an unactionable permanent release block; such findings remain visible in ordinary scanner review and must not be broadly allow-listed or suppressed. The human-readable report is retained for 90 days.
