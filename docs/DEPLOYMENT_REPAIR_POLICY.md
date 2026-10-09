# Production deployment failure repair policy

The `Koyeb production deployment watch` is observed by the autonomous repair
controller. A failed deployment **is not itself evidence of a code defect**.
The existing failed-step classifier deliberately rejects generic Koyeb,
deployment, worker, and infrastructure failures. Consequently this change
routes the signal but does not automatically change code or restart production.

## Required triage

1. Identify the exact main-branch commit and failing deployment-watch run.
2. Inspect the failed step and Koyeb build/runtime logs. Separate build/test
   defects from unavailable providers, deployment lag, permissions, quotas,
   missing secrets, and environment configuration.
3. For a proven repository defect, open a repair PR with the failing run,
   evidence, regression test, and smallest fix. CI and security gates apply.
4. For infrastructure or configuration problems, alert an operator. Never
   print secrets, guess credentials, or auto-retry write-producing jobs.
5. Confirm the corrected exact SHA is deployed and the post-deployment
   worker/API smoke is green before declaring recovery.

The existing automatic Renovate-only revert remains intentionally scoped.
Extending automatic repair to Koyeb failures requires a trustworthy
log-backed classifier and an explicit bounded retry/rollback policy. Do not
turn generic deployment failure into unrestricted Kilo execution.
