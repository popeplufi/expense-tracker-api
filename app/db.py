import sqlite3

from flask import current_app, g

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    category TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
"""


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def _ensure_expense_user_column(db):
    columns = db.execute("PRAGMA table_info(expenses)").fetchall()
    existing_columns = {column["name"] for column in columns}
    if "user_id" not in existing_columns:
        db.execute("ALTER TABLE expenses ADD COLUMN user_id INTEGER")
    db.execute("CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses (user_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date)")
    db.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_expenses_user_date_id
        ON expenses (user_id, expense_date DESC, id DESC)
        """
    )
    db.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_expenses_user_category_date
        ON expenses (user_id, category, expense_date DESC)
        """
    )


def init_db():
    db = get_db()
    db.executescript(SCHEMA_SQL)
    _ensure_expense_user_column(db)
    db.commit()


def close_db(_error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_app(app):
    app.teardown_appcontext(close_db)
