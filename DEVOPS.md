# DevOps Baseline

This repository now includes a production baseline for CI/CD, container orchestration, deploy safety, and monitoring.

## CI/CD

- Workflow: `.github/workflows/platform-ci.yml`
- Runs on push/PR for `app`, `gateway`, and `frontend-next`.
- Checks:
  - Python API compile + `/healthz`/`/readyz` smoke test
  - Gateway lint/test/build
  - Frontend lint/build
  - Docker Compose config validation for default, `next`, and `monitoring` profiles

## Render Deploy Hooks

- Workflow: `.github/workflows/render-deploy.yml`
- Manual trigger from GitHub Actions (`workflow_dispatch`).
- Requires repository secrets:
  - `RENDER_DEPLOY_HOOK_WEB`
  - `RENDER_DEPLOY_HOOK_GATEWAY`
  - `RENDER_DEPLOY_HOOK_FRONTEND_NEXT`

Deploy one service at a time or all services.

## Docker Compose Profiles

`docker-compose.yml` supports:

- Default profile:
  - `web` (Flask app)
  - `gateway` (Fastify + WebSocket)
  - `postgres`, `redis`, `nginx`
- `next` profile:
  - `frontend_next` (Next.js production server)
- `monitoring` profile:
  - `prometheus`, `grafana`

Examples:

```bash
docker compose up -d --build
docker compose --profile next up -d --build
docker compose --profile monitoring up -d
```

## Monitoring

- Prometheus config: `infra/monitoring/prometheus.yml`
- Scrapes `gateway:4000/metrics`
- Grafana exposed on `http://localhost:3001`

## Rollback-Safe Release Steps

1. Deploy one service only.
2. Verify health:
   - Flask: `/healthz`, `/readyz`
   - Gateway: `/healthz`, `/readyz`
3. Use `scripts/verify_release.sh`:
   - `scripts/verify_release.sh <health-url> <ready-url>`
4. If verification fails:
   - Roll back in Render to previous successful deploy.
   - Re-run verification against rollback target.
5. Only then deploy the next service.
