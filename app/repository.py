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


def create_user(username, password_hash, email=None):
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO users (username, email, password_hash)
        VALUES (?, ?, ?)
        """,
        (username, email, password_hash),
    )
    db.commit()
    return cursor.lastrowid


def get_user_by_username(username):
    db = get_db()
    row = db.execute(
        """
        SELECT id, username, email, password_hash, is_online, last_seen, created_at
        FROM users
        WHERE username = ?
        """,
        (username,),
    ).fetchone()
    return dict(row) if row else None


def get_user_by_email(email):
    db = get_db()
    row = db.execute(
        """
        SELECT id, username, email, password_hash, is_online, last_seen, created_at
        FROM users
        WHERE email = ?
        """,
        (email,),
    ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id):
    db = get_db()
    row = db.execute(
        """
        SELECT id, username, email, password_hash, is_online, last_seen, created_at
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def count_users():
    db = get_db()
    row = db.execute("SELECT COUNT(*) AS count FROM users").fetchone()
    return int(row["count"])


def set_user_online(user_id, is_online):
    db = get_db()
    db.execute(
        """
        UPDATE users
        SET is_online = ?, last_seen = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (1 if is_online else 0, user_id),
    )
    db.commit()


def touch_last_seen(user_id):
    db = get_db()
    db.execute(
        """
        UPDATE users
        SET last_seen = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (user_id,),
    )
    db.commit()


def create_login_event(
    user_id,
    username,
    success,
    ip_address=None,
    user_agent=None,
    source="web",
):
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO login_events (user_id, username, success, ip_address, user_agent, source)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            (username or "").strip() or None,
            1 if success else 0,
            (ip_address or "").strip() or None,
            (user_agent or "").strip() or None,
            (source or "web").strip() or "web",
        ),
    )
    db.commit()
    return cursor.lastrowid


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


def list_other_users(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT id, username, created_at
        FROM users
        WHERE id != ?
        ORDER BY username ASC
        """,
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def search_users_by_username(search_term, exclude_user_id, limit=30):
    db = get_db()
    query = str(search_term or "").strip()
    # Allow user-style handles like "@admin" in search input.
    query = query.lstrip("@")
    if not query:
        return []
    rows = db.execute(
        """
        SELECT id, username, is_online, last_seen
        FROM users
        WHERE id != ?
          AND username LIKE ?
        ORDER BY username ASC
        LIMIT ?
        """,
        (exclude_user_id, f"%{query}%", _safe_limit(limit, default=30, max_limit=100)),
    ).fetchall()
    return [dict(row) for row in rows]


def are_friends(user_a, user_b):
    user1 = min(user_a, user_b)
    user2 = max(user_a, user_b)
    db = get_db()
    row = db.execute(
        """
        SELECT 1
        FROM friendships
        WHERE user1_id = ? AND user2_id = ?
        LIMIT 1
        """,
        (user1, user2),
    ).fetchone()
    return bool(row)


def list_friends(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT u.id, u.username, u.is_online, u.last_seen
        FROM friendships f
        JOIN users u ON u.id = CASE
            WHEN f.user1_id = ? THEN f.user2_id
            ELSE f.user1_id
        END
        WHERE f.user1_id = ? OR f.user2_id = ?
        ORDER BY u.username ASC
        """,
        (user_id, user_id, user_id),
    ).fetchall()
    return [dict(row) for row in rows]


def list_incoming_friend_requests(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT fr.id, fr.sender_id, u.username AS sender_username, fr.created_at
        FROM friend_requests fr
        JOIN users u ON u.id = fr.sender_id
        WHERE fr.receiver_id = ? AND fr.status = 'pending'
        ORDER BY fr.created_at DESC, fr.id DESC
        """,
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def list_outgoing_friend_request_receiver_ids(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT receiver_id
        FROM friend_requests
        WHERE sender_id = ? AND status = 'pending'
        """,
        (user_id,),
    ).fetchall()
    return {int(row["receiver_id"]) for row in rows}


def send_friend_request(sender_id, receiver_id):
    if sender_id == receiver_id:
        return "invalid"
    if are_friends(sender_id, receiver_id):
        return "already_friends"

    db = get_db()
    reverse_pending = db.execute(
        """
        SELECT id
        FROM friend_requests
        WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
        LIMIT 1
        """,
        (receiver_id, sender_id),
    ).fetchone()
    if reverse_pending:
        user1 = min(sender_id, receiver_id)
        user2 = max(sender_id, receiver_id)
        db.execute(
            """
            UPDATE friend_requests
            SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (reverse_pending["id"],),
        )
        db.execute(
            """
            INSERT OR IGNORE INTO friendships (user1_id, user2_id)
            VALUES (?, ?)
            """,
            (user1, user2),
        )
        db.commit()
        return "accepted_reciprocal"

    existing = db.execute(
        """
        SELECT id
        FROM friend_requests
        WHERE (
            (sender_id = ? AND receiver_id = ?)
            OR (sender_id = ? AND receiver_id = ?)
        )
          AND status = 'pending'
        LIMIT 1
        """,
        (sender_id, receiver_id, receiver_id, sender_id),
    ).fetchone()
    if existing:
        return "pending_exists"

    db.execute(
        """
        INSERT INTO friend_requests (sender_id, receiver_id, status)
        VALUES (?, ?, 'pending')
        """,
        (sender_id, receiver_id),
    )
    db.commit()
    return "sent"


def respond_friend_request(request_id, receiver_id, accept):
    db = get_db()
    row = db.execute(
        """
        SELECT id, sender_id, receiver_id, status
        FROM friend_requests
        WHERE id = ?
        LIMIT 1
        """,
        (request_id,),
    ).fetchone()
    if not row:
        return False
    req = dict(row)
    if int(req["receiver_id"]) != int(receiver_id):
        return False
    if req["status"] != "pending":
        return False

    status = "accepted" if accept else "rejected"
    db.execute(
        """
        UPDATE friend_requests
        SET status = ?, responded_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (status, request_id),
    )

    if accept:
        user1 = min(int(req["sender_id"]), int(req["receiver_id"]))
        user2 = max(int(req["sender_id"]), int(req["receiver_id"]))
        db.execute(
            """
            INSERT OR IGNORE INTO friendships (user1_id, user2_id)
            VALUES (?, ?)
            """,
            (user1, user2),
        )
    db.commit()
    return True


def _find_direct_chat(user_a, user_b):
    db = get_db()
    row = db.execute(
        """
        SELECT c.id
        FROM chats c
        JOIN chat_members cm1 ON cm1.chat_id = c.id
        JOIN chat_members cm2 ON cm2.chat_id = c.id
        WHERE c.is_group = 0
          AND cm1.user_id = ?
          AND cm2.user_id = ?
          AND (SELECT COUNT(*) FROM chat_members x WHERE x.chat_id = c.id) = 2
        LIMIT 1
        """,
        (user_a, user_b),
    ).fetchone()
    return int(row["id"]) if row else None


def get_or_create_direct_chat(user_a, user_b):
    existing = _find_direct_chat(user_a, user_b)
    if existing:
        db = get_db()
        user1_id = min(user_a, user_b)
        user2_id = max(user_a, user_b)
        db.execute(
            """
            INSERT OR IGNORE INTO conversations (id, user1_id, user2_id, created_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (existing, user1_id, user2_id),
        )
        db.commit()
        return existing

    db = get_db()
    cursor = db.execute("INSERT INTO chats (is_group, name) VALUES (0, NULL)")
    chat_id = cursor.lastrowid
    db.execute(
        "INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)",
        (chat_id, user_a),
    )
    db.execute(
        "INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)",
        (chat_id, user_b),
    )
    user1_id = min(user_a, user_b)
    user2_id = max(user_a, user_b)
    db.execute(
        """
        INSERT OR IGNORE INTO conversations (id, user1_id, user2_id, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        """,
        (chat_id, user1_id, user2_id),
    )
    db.commit()
    return chat_id


def get_chat_member_ids(chat_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT user_id
        FROM chat_members
        WHERE chat_id = ?
        ORDER BY user_id ASC
        """,
        (chat_id,),
    ).fetchall()
    return [int(row["user_id"]) for row in rows]


def list_user_chats(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT
            c.id,
            c.is_group,
            c.name,
            (
                SELECT m.body
                FROM messages m
                WHERE m.chat_id = c.id
                ORDER BY m.id DESC
                LIMIT 1
            ) AS last_message,
            (
                SELECT m.created_at
                FROM messages m
                WHERE m.chat_id = c.id
                ORDER BY m.id DESC
                LIMIT 1
            ) AS last_message_at,
            (
                SELECT u.username
                FROM chat_members cm2
                JOIN users u ON u.id = cm2.user_id
                WHERE cm2.chat_id = c.id
                  AND cm2.user_id != ?
                ORDER BY u.username ASC
                LIMIT 1
            ) AS peer_username,
            (
                SELECT COUNT(*)
                FROM messages m
                WHERE COALESCE(m.conversation_id, m.chat_id) = c.id
                  AND m.sender_id != ?
                  AND COALESCE(m.is_seen, 0) = 0
            ) AS unread_count
        FROM chats c
        JOIN chat_members cm ON cm.chat_id = c.id
        WHERE cm.user_id = ?
        ORDER BY COALESCE(last_message_at, c.created_at) DESC, c.id DESC
        """,
        (user_id, user_id, user_id),
    ).fetchall()
    return [dict(row) for row in rows]


def user_in_chat(user_id, chat_id):
    db = get_db()
    row = db.execute(
        """
        SELECT 1
        FROM chat_members
        WHERE user_id = ? AND chat_id = ?
        LIMIT 1
        """,
        (user_id, chat_id),
    ).fetchone()
    return bool(row)


def get_chat(chat_id):
    db = get_db()
    row = db.execute(
        "SELECT id, is_group, name, created_at FROM chats WHERE id = ?",
        (chat_id,),
    ).fetchone()
    return dict(row) if row else None


def list_chat_messages(chat_id, limit=120):
    db = get_db()
    rows = db.execute(
        """
        SELECT
            m.id,
            COALESCE(m.conversation_id, m.chat_id) AS chat_id,
            m.sender_id,
            u.username AS sender_username,
            COALESCE(m.content, m.body) AS body,
            COALESCE(m.timestamp, m.created_at) AS created_at,
            m.is_seen
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE COALESCE(m.conversation_id, m.chat_id) = ?
        ORDER BY m.id DESC
        LIMIT ?
        """,
        (chat_id, _safe_limit(limit, default=120, max_limit=500)),
    ).fetchall()
    items = [dict(row) for row in rows]
    items.reverse()
    return items


def create_message(chat_id, sender_id, body):
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO messages (conversation_id, sender_id, content, timestamp, is_seen, chat_id, body, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0, ?, ?, CURRENT_TIMESTAMP)
        """,
        (chat_id, sender_id, body, chat_id, body),
    )
    db.commit()
    return cursor.lastrowid


def chat_stats(user_id):
    db = get_db()
    chats_row = db.execute(
        "SELECT COUNT(*) AS count FROM chat_members WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    sent_row = db.execute(
        "SELECT COUNT(*) AS count FROM messages WHERE sender_id = ?",
        (user_id,),
    ).fetchone()
    contacts_row = db.execute(
        "SELECT COUNT(*) AS count FROM users WHERE id != ?",
        (user_id,),
    ).fetchone()
    return {
        "chat_count": int(chats_row["count"]) if chats_row else 0,
        "sent_count": int(sent_row["count"]) if sent_row else 0,
        "contact_count": int(contacts_row["count"]) if contacts_row else 0,
    }


def get_message_by_id(message_id):
    db = get_db()
    row = db.execute(
        """
        SELECT
            m.id,
            COALESCE(m.conversation_id, m.chat_id) AS chat_id,
            m.sender_id,
            u.username AS sender_username,
            COALESCE(m.content, m.body) AS body,
            COALESCE(m.timestamp, m.created_at) AS created_at,
            m.is_seen
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.id = ?
        LIMIT 1
        """,
        (message_id,),
    ).fetchone()
    return dict(row) if row else None


def create_status(user_id, content=None, media_path=None, media_type=None):
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO statuses (user_id, content, media_path, media_type, expires_at)
        VALUES (?, ?, ?, ?, datetime('now', '+24 hours'))
        """,
        (user_id, content, media_path, media_type),
    )
    db.commit()
    return cursor.lastrowid


def list_active_statuses():
    db = get_db()
    rows = db.execute(
        """
        SELECT
            s.id,
            s.user_id,
            s.content,
            s.media_path,
            s.media_type,
            s.created_at,
            s.expires_at,
            u.username
        FROM statuses s
        JOIN users u ON u.id = s.user_id
        WHERE s.expires_at > CURRENT_TIMESTAMP
        ORDER BY s.created_at DESC, s.id DESC
        """,
    ).fetchall()
    return [dict(row) for row in rows]


def list_active_statuses_for_user(user_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT id, user_id, content, media_path, media_type, created_at, expires_at
        FROM statuses
        WHERE user_id = ?
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC, id DESC
        """,
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def mark_messages_seen(chat_id, viewer_id):
    db = get_db()
    rows = db.execute(
        """
        SELECT id
        FROM messages
        WHERE COALESCE(conversation_id, chat_id) = ?
          AND sender_id != ?
          AND COALESCE(is_seen, 0) = 0
        """,
        (chat_id, viewer_id),
    ).fetchall()
    message_ids = [int(row["id"]) for row in rows]
    if not message_ids:
        return []
    db.execute(
        """
        UPDATE messages
        SET is_seen = 1
        WHERE COALESCE(conversation_id, chat_id) = ?
          AND sender_id != ?
          AND COALESCE(is_seen, 0) = 0
        """,
        (chat_id, viewer_id),
    )
    db.commit()
    return message_ids


def upsert_push_subscription(user_id, endpoint, p256dh, auth, user_agent=None):
    db = get_db()
    db.execute(
        """
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, endpoint) DO UPDATE SET
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            user_agent = excluded.user_agent,
            updated_at = CURRENT_TIMESTAMP
        """,
        (user_id, endpoint, p256dh, auth, user_agent),
    )
    db.commit()


def list_push_subscriptions_for_users(user_ids):
    ids = [int(value) for value in user_ids if value is not None]
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    db = get_db()
    rows = db.execute(
        f"""
        SELECT id, user_id, endpoint, p256dh, auth
        FROM push_subscriptions
        WHERE user_id IN ({placeholders})
        """,
        ids,
    ).fetchall()
    return [dict(row) for row in rows]


def count_push_subscriptions_for_user(user_id):
    db = get_db()
    row = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM push_subscriptions
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    return int(row["count"]) if row else 0


def delete_push_subscription_by_endpoint(user_id, endpoint):
    db = get_db()
    cursor = db.execute(
        """
        DELETE FROM push_subscriptions
        WHERE user_id = ? AND endpoint = ?
        """,
        (user_id, endpoint),
    )
    db.commit()
    return cursor.rowcount > 0


def list_login_events(limit=50, offset=0, username=None, source=None, success=None):
    db = get_db()
    query = """
    SELECT id, user_id, username, success, ip_address, user_agent, source, created_at
    FROM login_events
    WHERE 1=1
    """
    params = []
    if username:
        query += " AND username LIKE ?"
        params.append(f"%{username.strip()}%")
    if source:
        query += " AND source = ?"
        params.append(source.strip())
    if success is not None:
        query += " AND success = ?"
        params.append(1 if success else 0)

    query += " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    params.extend([_safe_limit(limit, default=50, max_limit=200), _safe_offset(offset)])
    rows = db.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def count_login_events(username=None, source=None, success=None):
    db = get_db()
    query = "SELECT COUNT(*) AS count FROM login_events WHERE 1=1"
    params = []
    if username:
        query += " AND username LIKE ?"
        params.append(f"%{username.strip()}%")
    if source:
        query += " AND source = ?"
        params.append(source.strip())
    if success is not None:
        query += " AND success = ?"
        params.append(1 if success else 0)
    row = db.execute(query, params).fetchone()
    return int(row["count"]) if row else 0
