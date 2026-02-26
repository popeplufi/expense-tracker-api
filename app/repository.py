from datetime import date

from .db import get_db


def _month_bounds(month):
    value = str(month or "").strip()
    if len(value) != 7:
        return None, None
    try:
        start = date.fromisoformat(f"{value}-01")
    except ValueError:
        return None, None

    if start.month == 12:
        end = date(start.year + 1, 1, 1)
    else:
        end = date(start.year, start.month + 1, 1)

    return start.isoformat(), end.isoformat()


def _query_filters(category=None, month=None):
    filters = []
    params = []

    if category:
        filters.append("category = ?")
        params.append(category)

    if month:
        start, end = _month_bounds(month)
        if start and end:
            filters.append("expense_date >= ? AND expense_date < ?")
            params.extend([start, end])

    return filters, params


def _safe_limit(limit, default=20, max_limit=200):
    if limit is None:
        return default
    try:
        value = int(limit)
    except (TypeError, ValueError):
        return default
    return max(1, min(value, max_limit))


def _safe_offset(offset):
    try:
        value = int(offset)
    except (TypeError, ValueError):
        return 0
    return max(0, value)


def create_user(username, password_hash):
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO users (username, password_hash)
        VALUES (?, ?)
        """,
        (username, password_hash),
    )
    db.commit()
    return cursor.lastrowid


def get_user_by_username(username):
    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id):
    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def count_users():
    db = get_db()
    row = db.execute("SELECT COUNT(*) AS count FROM users").fetchone()
    return int(row["count"])


def add_expense(user_id, name, amount, category, expense_date):
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO expenses (user_id, name, amount, category, expense_date)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, name, amount, category, expense_date),
    )
    db.commit()
    return cursor.lastrowid


def add_unowned_expense(name, amount, category, expense_date):
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO expenses (name, amount, category, expense_date, user_id)
        VALUES (?, ?, ?, ?, NULL)
        """,
        (name, amount, category, expense_date),
    )
    db.commit()
    return cursor.lastrowid


def list_expenses(user_id, category=None, month=None, limit=None, offset=0):
    db = get_db()
    query = """
    SELECT id, name, amount, category, expense_date
    FROM expenses
    WHERE user_id = ?
    """
    params = [user_id]

    filters, filter_params = _query_filters(category=category, month=month)
    if filters:
        query += " AND " + " AND ".join(filters)
        params.extend(filter_params)

    query += " ORDER BY expense_date DESC, id DESC"

    if limit is not None:
        query += " LIMIT ? OFFSET ?"
        params.extend([_safe_limit(limit), _safe_offset(offset)])

    rows = db.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def count_expenses(user_id, category=None, month=None):
    db = get_db()
    query = "SELECT COUNT(*) AS count FROM expenses WHERE user_id = ?"
    params = [user_id]

    filters, filter_params = _query_filters(category=category, month=month)
    if filters:
        query += " AND " + " AND ".join(filters)
        params.extend(filter_params)

    row = db.execute(query, params).fetchone()
    return int(row["count"])


def delete_expense(user_id, expense_id):
    db = get_db()
    cursor = db.execute(
        "DELETE FROM expenses WHERE id = ? AND user_id = ?",
        (expense_id, user_id),
    )
    db.commit()
    return cursor.rowcount > 0


def total_amount(user_id, category=None, month=None):
    db = get_db()
    query = "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ?"
    params = [user_id]

    filters, filter_params = _query_filters(category=category, month=month)
    if filters:
        query += " AND " + " AND ".join(filters)
        params.extend(filter_params)

    row = db.execute(query, params).fetchone()
    return float(row["total"])


def count_all_expenses():
    db = get_db()
    row = db.execute("SELECT COUNT(*) AS count FROM expenses").fetchone()
    return int(row["count"])


def count_unowned_expenses():
    db = get_db()
    row = db.execute(
        "SELECT COUNT(*) AS count FROM expenses WHERE user_id IS NULL"
    ).fetchone()
    return int(row["count"])


def claim_unowned_expenses(user_id):
    db = get_db()
    cursor = db.execute(
        "UPDATE expenses SET user_id = ? WHERE user_id IS NULL",
        (user_id,),
    )
    db.commit()
    return cursor.rowcount


def list_categories(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT DISTINCT category
        FROM expenses
        WHERE user_id = ?
        ORDER BY category ASC
        """,
        (user_id,),
    ).fetchall()
    return [row["category"] for row in rows]


def list_months(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT DISTINCT substr(expense_date, 1, 7) AS month
        FROM expenses
        WHERE user_id = ?
        ORDER BY month DESC
        """,
        (user_id,),
    ).fetchall()
    return [row["month"] for row in rows if row["month"]]


def monthly_summary(user_id, limit=12):
    db = get_db()
    rows = db.execute(
        """
        SELECT
            substr(expense_date, 1, 7) AS month,
            COUNT(*) AS count,
            COALESCE(SUM(amount), 0) AS total
        FROM expenses
        WHERE user_id = ?
        GROUP BY month
        ORDER BY month DESC
        LIMIT ?
        """,
        (user_id, _safe_limit(limit, default=12, max_limit=36)),
    ).fetchall()
    return [dict(row) for row in rows]


def category_summary(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT
            category,
            COALESCE(SUM(amount), 0) AS total
        FROM expenses
        WHERE user_id = ?
        GROUP BY category
        ORDER BY total DESC, category ASC
        """,
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def spending_trend(user_id, limit=30):
    db = get_db()
    rows = db.execute(
        """
        SELECT day, total
        FROM (
            SELECT
                expense_date AS day,
                COALESCE(SUM(amount), 0) AS total
            FROM expenses
            WHERE user_id = ?
            GROUP BY expense_date
            ORDER BY expense_date DESC
            LIMIT ?
        )
        ORDER BY day ASC
        """,
        (user_id, _safe_limit(limit, default=30, max_limit=120)),
    ).fetchall()
    return [dict(row) for row in rows]


def profile_stats(user_id):
    db = get_db()
    overview = db.execute(
        """
        SELECT
            COUNT(*) AS expense_count,
            COALESCE(SUM(amount), 0) AS total_spent,
            MIN(expense_date) AS first_expense_date,
            MAX(expense_date) AS latest_expense_date
        FROM expenses
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()

    top_category = db.execute(
        """
        SELECT category, COALESCE(SUM(amount), 0) AS total
        FROM expenses
        WHERE user_id = ?
        GROUP BY category
        ORDER BY total DESC, category ASC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()

    return {
        "expense_count": int(overview["expense_count"]) if overview else 0,
        "total_spent": float(overview["total_spent"]) if overview else 0.0,
        "first_expense_date": overview["first_expense_date"] if overview else None,
        "latest_expense_date": overview["latest_expense_date"] if overview else None,
        "top_category": dict(top_category) if top_category else None,
    }
