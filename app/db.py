import sqlite3

from flask import current_app, g

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    is_online INTEGER NOT NULL DEFAULT 0,
    last_seen TEXT,
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

CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    is_group INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER,
    user2_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_members (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    sender_id INTEGER NOT NULL,
    content TEXT,
    timestamp TEXT,
    is_seen INTEGER NOT NULL DEFAULT 0,
    chat_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TEXT,
    FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL,
    user2_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user1_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT,
    media_path TEXT,
    media_type TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    ip_address TEXT,
    user_agent TEXT,
    source TEXT NOT NULL DEFAULT 'web',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
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


def _ensure_user_columns(db):
    columns = db.execute("PRAGMA table_info(users)").fetchall()
    existing_columns = {column["name"] for column in columns}
    if "email" not in existing_columns:
        db.execute("ALTER TABLE users ADD COLUMN email TEXT")
    if "is_online" not in existing_columns:
        db.execute("ALTER TABLE users ADD COLUMN is_online INTEGER NOT NULL DEFAULT 0")
    if "last_seen" not in existing_columns:
        db.execute("ALTER TABLE users ADD COLUMN last_seen TEXT")
    if "created_at" not in existing_columns:
        db.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
    db.execute("UPDATE users SET is_online = 0 WHERE is_online IS NULL")
    db.execute("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)")
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email)")


def _ensure_chat_columns(db):
    db.execute("CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members (user_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON chat_members (chat_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_messages_chat_id_id ON messages (chat_id, id DESC)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages (sender_id)")


def _ensure_conversation_table(db):
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user1_id INTEGER,
            user2_id INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    columns = db.execute("PRAGMA table_info(conversations)").fetchall()
    existing_columns = {column["name"] for column in columns}
    if "user1_id" not in existing_columns:
        db.execute("ALTER TABLE conversations ADD COLUMN user1_id INTEGER")
    if "user2_id" not in existing_columns:
        db.execute("ALTER TABLE conversations ADD COLUMN user2_id INTEGER")
    if "created_at" not in existing_columns:
        db.execute("ALTER TABLE conversations ADD COLUMN created_at TEXT")
    db.execute("UPDATE conversations SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
    db.execute("CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations (created_at)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user1_id ON conversations (user1_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user2_id ON conversations (user2_id)")
    chat_columns = {
        column["name"] for column in db.execute("PRAGMA table_info(chats)").fetchall()
    }
    chat_created_expr = "created_at" if "created_at" in chat_columns else "CURRENT_TIMESTAMP"
    # Backfill from existing chats so current chat IDs are represented as conversations.
    db.execute(
        f"""
        INSERT OR IGNORE INTO conversations (id, created_at)
        SELECT id, {chat_created_expr}
        FROM chats
        """
    )
    # Backfill user pair from two-member direct chats.
    db.execute(
        """
        UPDATE conversations
        SET
            user1_id = (
                SELECT MIN(cm.user_id)
                FROM chat_members cm
                WHERE cm.chat_id = conversations.id
            ),
            user2_id = (
                SELECT MAX(cm.user_id)
                FROM chat_members cm
                WHERE cm.chat_id = conversations.id
            )
        WHERE user1_id IS NULL OR user2_id IS NULL
        """
    )


def _ensure_message_columns(db):
    columns = db.execute("PRAGMA table_info(messages)").fetchall()
    existing_columns = {column["name"] for column in columns}

    if "conversation_id" not in existing_columns:
        db.execute("ALTER TABLE messages ADD COLUMN conversation_id INTEGER")
    if "chat_id" not in existing_columns:
        db.execute("ALTER TABLE messages ADD COLUMN chat_id INTEGER")
    if "sender_id" not in existing_columns:
        db.execute("ALTER TABLE messages ADD COLUMN sender_id INTEGER")
    if "body" not in existing_columns:
        db.execute("ALTER TABLE messages ADD COLUMN body TEXT")
    if "created_at" not in existing_columns:
        db.execute("ALTER TABLE messages ADD COLUMN created_at TEXT")
    if "content" not in existing_columns:
        db.execute("ALTER TABLE messages ADD COLUMN content TEXT")
    if "timestamp" not in existing_columns:
        db.execute("ALTER TABLE messages ADD COLUMN timestamp TEXT")
    if "is_seen" not in existing_columns:
        db.execute("ALTER TABLE messages ADD COLUMN is_seen INTEGER NOT NULL DEFAULT 0")

    # Backfill new columns from legacy ones.
    db.execute(
        """
        UPDATE messages
        SET conversation_id = chat_id
        WHERE conversation_id IS NULL
        """
    )
    db.execute(
        """
        UPDATE messages
        SET body = content
        WHERE (body IS NULL OR body = '')
        """
    )
    db.execute(
        """
        UPDATE messages
        SET content = body
        WHERE (content IS NULL OR content = '')
        """
    )
    db.execute(
        """
        UPDATE messages
        SET timestamp = created_at
        WHERE (timestamp IS NULL OR timestamp = '')
        """
    )
    db.execute("UPDATE messages SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
    db.execute("UPDATE messages SET is_seen = 0 WHERE is_seen IS NULL")

    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_id ON messages (conversation_id, id DESC)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp ON messages (conversation_id, timestamp)"
    )


def _ensure_friendship_tables(db):
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            responded_at TEXT,
            FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user1_id INTEGER NOT NULL,
            user2_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user1_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (user2_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_status ON friend_requests (receiver_id, status)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_status ON friend_requests (sender_id, status)"
    )
    db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair ON friendships (user1_id, user2_id)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships (user1_id)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships (user2_id)"
    )


def _ensure_status_table(db):
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS statuses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            content TEXT,
            media_path TEXT,
            media_type TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """
    )
    columns = db.execute("PRAGMA table_info(statuses)").fetchall()
    existing_columns = {column["name"] for column in columns}
    if "media_path" not in existing_columns:
        db.execute("ALTER TABLE statuses ADD COLUMN media_path TEXT")
    if "media_type" not in existing_columns:
        db.execute("ALTER TABLE statuses ADD COLUMN media_type TEXT")
    db.execute("CREATE INDEX IF NOT EXISTS idx_statuses_user_id ON statuses (user_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_statuses_expires_at ON statuses (expires_at)")


def _ensure_push_subscriptions_table(db):
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """
    )
    db.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint
        ON push_subscriptions (user_id, endpoint)
        """
    )
    db.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
        ON push_subscriptions (user_id)
        """
    )


def _ensure_login_events_table(db):
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS login_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            success INTEGER NOT NULL DEFAULT 0,
            ip_address TEXT,
            user_agent TEXT,
            source TEXT NOT NULL DEFAULT 'web',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        )
        """
    )
    db.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_login_events_user_created
        ON login_events (user_id, created_at DESC)
        """
    )
    db.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_login_events_created
        ON login_events (created_at DESC)
        """
    )


def init_db():
    db = get_db()
    db.executescript(SCHEMA_SQL)
    _ensure_user_columns(db)
    _ensure_expense_user_column(db)
    _ensure_conversation_table(db)
    _ensure_message_columns(db)
    _ensure_chat_columns(db)
    _ensure_friendship_tables(db)
    _ensure_status_table(db)
    _ensure_push_subscriptions_table(db)
    _ensure_login_events_table(db)
    db.commit()


def close_db(_error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_app(app):
    app.teardown_appcontext(close_db)
