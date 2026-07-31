# MAST security policy

**Status:** Production-controlled
**Last reviewed:** 16 June 2026

MAST controls scheduled and manual triggers. Production manual routes require `CRON_ADMIN_TOKEN` and `ALLOW_PUBLIC_MANUAL_RUNS` must remain `false`. Downstream AIMS and RAMS tokens are stored only in Koyeb Secrets.

Public health and compact status responses intentionally omit full endpoint URLs, tokens and request bodies. Detailed status and the job registry require admin authentication. Report suspected unauthorised scheduling or credential exposure privately to the repository owner.

Production scheduler state is stored in R2 so restarts do not erase run keys. Scope the token to the `metasystem` bucket and rotate it after suspected exposure.
