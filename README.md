# Expense Tracker Pro (Flask + SQLite)

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 main.py
```

Open: `http://127.0.0.1:5001`

## Project Structure

- `app/__init__.py`: Flask app factory and startup migration.
- `app/db.py`: SQLite connection and schema initialization.
- `app/repository.py`: Data access layer (auth, per-user CRUD, filters, summaries).
- `app/services.py`: JSON-to-SQLite migration logic.
- `app/routes.py`: HTTP routes and request validation.
- `app/templates/`: HTML interface.
- `app/static/styles.css`: Frontend styling.
- `main.py` / `run.py`: app entry points.

## Notes

- Existing `expenses.json` is auto-imported into SQLite on first run when the DB is empty.
- Registration and login use hashed passwords (`werkzeug.security`).
- Each account only sees and manages its own expenses.
- Data is stored in `expenses.db` by default.
- Override DB location in any environment with `DATABASE_PATH`.

## Deploy

- `Render`, `Railway`, and `VPS` instructions: see `DEPLOY.md`.
- DevOps baseline (CI/CD, Docker profiles, monitoring, rollback checks): see `DEVOPS.md`.
- Production start command: `gunicorn run:app -c gunicorn.conf.py`
- Health endpoint: `GET /healthz`
- Readiness endpoint (checks DB): `GET /readyz`

## Professional Architecture Layer

A new production-grade gateway scaffold is included in `gateway/`:

- Node.js + Fastify API gateway
- JWT auth with rotating refresh tokens
- Redis-backed rate limiting
- Audit logging to PostgreSQL
- WebSocket + Redis pub/sub adapter for horizontal scaling
- Device key registration and pre-key bundle retrieval for async encrypted messaging
- Chat REST APIs for envelope ingestion and pagination
- Prometheus metrics endpoint and instrumentation
- Versioned SQL migrations + startup migration runner

See: `gateway/README.md`

## Push Notifications (Production)

1. Generate VAPID keys:
```bash
python3 scripts/generate_vapid_keys.py
```
2. Set these env vars on your server:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_CLAIMS_SUB` (must be `mailto:...`)
3. Ensure HTTPS is enabled on the live domain (service workers require secure context).
4. Login, open `Settings`, click `Check status`, then `Send test push`.
5. Optional diagnostics endpoints:
- `GET /api/push/status`
- `POST /api/push/test`

## Admin Login Logs

- Admin UI: `/admin/login-events`
- Admin API: `/api/admin/login-events`
- Admin users are configured via env:
  - `ADMIN_USERNAMES` (comma-separated usernames, default `admin`)
  - `ADMIN_USER_IDS` (comma-separated numeric IDs)

## AI Bot Chat

- Open AI chat at: `/chat/bot`
- Bot account is auto-created from env config:
  - `AI_BOT_ENABLED` (`1`/`0`)
  - `AI_BOT_USERNAME`
  - `AI_BOT_PASSWORD`
- If `OPENAI_API_KEY` is set, bot uses OpenAI Responses API.
- If `OPENAI_API_KEY` is empty, bot uses built-in fallback replies.
