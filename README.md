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
- Production start command: `gunicorn run:app -c gunicorn.conf.py`
