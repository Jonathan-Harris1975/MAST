# Free podcast discovery snapshot schedule

The MAST scheduler invokes the authenticated AIMS endpoint
`POST /ops/podcast-growth/snapshot` each Wednesday at 14:10 Europe/London.
This is **public search evidence**, not a verified Apple/Spotify/PodSEO chart
ranking or listener analytics. AIMS stores dated private snapshots in R2.

Safety: no paid models, no advertising budget, no new providers, no publishing,
no PodSEO or Headroom changes. Request retries are disabled; a failed optional
discovery check does not consume the core production failure window. Existing
Friday podcast, Thursday promotion, monthly audit and KDP slots are unchanged.

Deploy this schedule only after the matching AIMS growth endpoint and storage
permissions have been verified live. If Apple or Podcast Index is unavailable,
AIMS marks the snapshot partial/unavailable rather than inventing results.
