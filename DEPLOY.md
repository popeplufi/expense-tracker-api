# Deploy Expense Tracker Pro

This app is ready for deployment with:
- `gunicorn` (`run:app`)
- `Procfile` for Railway-style runtimes
- `render.yaml` for Render blueprint deploy
- `Dockerfile` + `docker-compose.yml` for VPS

## 1) Render

### Option A: Blueprint (recommended)
1. Push this repo to GitHub.
2. In Render, create a new Blueprint and select the repo.
3. Render will read `render.yaml`.

### Option B: Manual Web Service
Use:
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn run:app -c gunicorn.conf.py`

Set env vars:
- `SECRET_KEY` = long random string
- `DATABASE_PATH` = `/opt/render/project/src/expenses.db` (ephemeral unless you attach a disk)

## 2) Railway

1. Create a new project and link your repo.
2. Railway can use `Procfile` automatically.
3. Set variables:
   - `SECRET_KEY` = long random string
   - `DATABASE_PATH` = `/data/expenses.db` (or your mounted volume path)

Start command (if you set manually):
- `gunicorn run:app -c gunicorn.conf.py`

## 3) VPS (Docker)

On your VPS:

```bash
git clone <your-repo-url>
cd <repo-folder>
docker compose up -d --build
```

App URL:
- `http://<your-server-ip>:8000`

For HTTPS and domain:
- Put Nginx/Caddy in front and enable TLS (Let's Encrypt).

## Production Notes

- Replace default `SECRET_KEY`.
- Use a persistent disk/volume for SQLite (`DATABASE_PATH`).
- For high scale, migrate DB from SQLite to PostgreSQL.
