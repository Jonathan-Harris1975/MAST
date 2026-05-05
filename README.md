    # Master-trigger-control

    Production-grade Cloudflare Worker used to fire the scheduled Hookdeck trigger URLs for **Master-trigger-control**.

    This repo is intentionally small and boring:
    - one Worker
    - one schedule map
    - one deploy config
    - one place to edit jobs


> Note
>
> The attached workbook/PDF listed the `Master-trigger-control` endpoints but did not include explicit cron times for this existing worker. The schedule in this repo is therefore a conservative default I set to keep the services separated cleanly and easy to edit in one place.

    ## How it works

    Cloudflare cron triggers run in **UTC**, while your requested times are clearly meant in **Europe/London** time.
    Instead of hard-coding a seasonally wrong UTC schedule like an amateur hour deployment, this worker uses a **dual UTC trigger pattern**:

    1. `wrangler.jsonc` contains both possible UTC times for each local London time
    2. the Worker converts the runtime timestamp to `Europe/London`
    3. it only fires jobs whose configured **local day + local time** match exactly

    That means:
    - BST and GMT are both handled cleanly
    - no twice-a-year code edits
    - the readable source of truth stays in local UK time

    ## Job schedule

    | Local day | Local time | Job | Hookdeck call | App endpoint |
    |---|---:|---|---|---|
    | `monday` | `09:00` | `rss-rewrite` | `POST https://hooks.jonathan-harris.online/x20n0wzcy7t5s0` | `https://app.jonathan-harris.online/rss/rewrite` |
| `tuesday` | `09:00` | `rss-rewrite` | `POST https://hooks.jonathan-harris.online/x20n0wzcy7t5s0` | `https://app.jonathan-harris.online/rss/rewrite` |
| `wednesday` | `09:00` | `rss-rewrite` | `POST https://hooks.jonathan-harris.online/x20n0wzcy7t5s0` | `https://app.jonathan-harris.online/rss/rewrite` |
| `thursday` | `09:00` | `rss-rewrite` | `POST https://hooks.jonathan-harris.online/x20n0wzcy7t5s0` | `https://app.jonathan-harris.online/rss/rewrite` |
| `friday` | `09:00` | `rss-rewrite` | `POST https://hooks.jonathan-harris.online/x20n0wzcy7t5s0` | `https://app.jonathan-harris.online/rss/rewrite` |
| `saturday` | `09:00` | `rss-rewrite` | `POST https://hooks.jonathan-harris.online/x20n0wzcy7t5s0` | `https://app.jonathan-harris.online/rss/rewrite` |
| `sunday` | `09:00` | `rss-rewrite` | `POST https://hooks.jonathan-harris.online/x20n0wzcy7t5s0` | `https://app.jonathan-harris.online/rss/rewrite` |
| `monday` | `09:30` | `outreach-batch-next` | `POST https://hooks.jonathan-harris.online/ni7jxprq9hdc4r` | `https://app.jonathan-harris.online/outreach/batch/next` |
| `tuesday` | `09:30` | `outreach-batch-next` | `POST https://hooks.jonathan-harris.online/ni7jxprq9hdc4r` | `https://app.jonathan-harris.online/outreach/batch/next` |
| `wednesday` | `09:30` | `outreach-batch-next` | `POST https://hooks.jonathan-harris.online/ni7jxprq9hdc4r` | `https://app.jonathan-harris.online/outreach/batch/next` |
| `thursday` | `09:30` | `outreach-batch-next` | `POST https://hooks.jonathan-harris.online/ni7jxprq9hdc4r` | `https://app.jonathan-harris.online/outreach/batch/next` |
| `friday` | `09:30` | `outreach-batch-next` | `POST https://hooks.jonathan-harris.online/ni7jxprq9hdc4r` | `https://app.jonathan-harris.online/outreach/batch/next` |
| `friday` | `10:00` | `podcast-run` | `POST https://hooks.jonathan-harris.online/x7td31z6y149hn` | `https://app.jonathan-harris.online/podcast/run` |
| `monday` | `16:00` | `blog-weekly-build` | `POST https://hooks.jonathan-harris.online/1ir1t71n70n5dc` | `https://app.jonathan-harris.online/blog/weekly/build` |

    ## Cron entries in `wrangler.jsonc`

    These are the **UTC candidate triggers** used to support London time across DST changes:

    - `0 8 * * *`
- `30 8 * * *`
- `0 9 * * *`
- `30 9 * * *`
- `0 10 * * *`
- `0 15 * * *`
- `0 16 * * *`

    ## Deploy

    ```bash
    npm install
    npx wrangler deploy
    ```

    ## Quick check

    ```bash
    npm run check
    ```

    ## Files

    - `src/index.js` - Worker logic and job list
    - `wrangler.jsonc` - Cloudflare Worker config and cron triggers
    - `package.json` - minimal package metadata and scripts

    ## Editing the schedule

    Edit the `JOBS` array in `src/index.js`.
    Keep the entries in **Europe/London** time.
    Then update `wrangler.jsonc` only if you introduce a brand new local trigger minute or hour.
