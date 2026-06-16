> **Document status:** Production reference  
> **Last reviewed:** 16 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# MAST

MAST is the master automation scheduler for the Jonathan Harris ecosystem. It runs as a small Node.js web service on Koyeb, evaluates governed schedules in the Europe/London time zone and triggers AIMS, RAMS and Hookdeck routes with bounded retries.

## Production endpoints

| Endpoint | Auth | Purpose |
|---|---:|---|
| `GET /health` | No | Health and scheduler summary |
| `GET /livez` | No | Liveness probe |
| `GET /readyz` | No | Configuration readiness |
| `GET /status` | No | Compact operational status for HIVE |
| `GET /status/details` | Admin | Detailed schedule and recent results |
| `GET /jobs` | Admin | Governed job registry |
| `POST /tick` | Admin | Manual scheduler tick |
| `POST /run/:id` | Admin | Manual job execution |

## Local verification

```bash
npm ci --ignore-scripts
npm run verify
```

## Durable scheduler state

Production uses the `metasystem` R2 bucket for durable run keys and recent results. Set `MAST_STATE_BACKEND=r2`; local state is permitted only for tests or deliberate emergency operation.

## Koyeb deployment

Deploy as a Web Service so HIVE can probe the health routes. The Koyeb resource reference `overall-frances/mast-1` identifies the app/service, while the exact public hostname must be copied from the Koyeb Domains panel and supplied to HIVE as `MAST_HEALTH_URL=<base>/health` and `MAST_STATUS_URL=<base>/status`.

Required production secrets are `CRON_ADMIN_TOKEN`, `AIMS_API_KEY` and `RMS_API_KEY`. Public manual execution must remain disabled. See [`.env.example`](.env.example), [`SECURITY.md`](SECURITY.md) and [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
