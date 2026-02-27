import os
from pathlib import Path

from flask import Flask, g, request
from flask_login import LoginManager
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy

from .db import init_app, init_db
from .backup import maybe_backup_database, restore_latest_backup_if_needed
from .i18n import (
    CURRENCY_OPTIONS,
    DEFAULT_CURRENCY,
    DEFAULT_LANGUAGE,
    DEFAULT_TIMEZONE,
    LANGUAGE_OPTIONS,
    normalize_currency,
    normalize_language,
    normalize_timezone,
    t,
)
from .services import migrate_json_if_needed

db = SQLAlchemy()
login_manager = LoginManager()
socketio = SocketIO()


@login_manager.user_loader
def load_user(user_id):
    from . import repository
    from .session_user import SessionUser

    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        return None

    user = repository.get_user_by_id(user_id_int)
    if not user:
        return None
    return SessionUser(user["id"], user["username"])


def create_app(test_config=None):
    app = Flask(__name__)

    project_root = Path(app.root_path).parent
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
    generated_secret = os.urandom(32).hex()
    configured_secret = os.environ.get("SECRET_KEY")
    configured_jwt_secret = os.environ.get("JWT_SECRET_KEY")
    runtime_secret = configured_secret or configured_jwt_secret or generated_secret
    database_path = os.path.expanduser(
        os.environ.get("DATABASE_PATH", str(project_root / "expenses.db"))
    )
    app.config.update(
        SECRET_KEY=runtime_secret,
        JWT_SECRET_KEY=configured_jwt_secret or runtime_secret,
        JWT_EXPIRES_MINUTES=os.environ.get("JWT_EXPIRES_MINUTES", "10080"),
        DATABASE=database_path,
        SQLALCHEMY_DATABASE_URI=database_url or "sqlite:///app.db",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        JSON_IMPORT_PATH=os.environ.get(
            "JSON_IMPORT_PATH", str(project_root / "expenses.json")
        ),
        BACKUP_DIR=os.environ.get("BACKUP_DIR", "/var/data/backups"),
        AUTO_BACKUP_ENABLED=os.environ.get("AUTO_BACKUP_ENABLED", "1"),
        AUTO_RESTORE_FROM_BACKUP=os.environ.get("AUTO_RESTORE_FROM_BACKUP", "1"),
        BACKUP_MIN_INTERVAL_SECONDS=os.environ.get("BACKUP_MIN_INTERVAL_SECONDS", "120"),
        BACKUP_KEEP_COUNT=os.environ.get("BACKUP_KEEP_COUNT", "20"),
        VAPID_PUBLIC_KEY=os.environ.get("VAPID_PUBLIC_KEY", ""),
        VAPID_PRIVATE_KEY=os.environ.get("VAPID_PRIVATE_KEY", ""),
        VAPID_CLAIMS_SUB=os.environ.get("VAPID_CLAIMS_SUB", "mailto:admin@example.com"),
        ADMIN_USERNAMES=os.environ.get("ADMIN_USERNAMES", "admin"),
        ADMIN_USER_IDS=os.environ.get("ADMIN_USER_IDS", ""),
        AI_BOT_USERNAME=os.environ.get("AI_BOT_USERNAME", "plufi_ai"),
        AI_BOT_PASSWORD=os.environ.get("AI_BOT_PASSWORD", "plufi-ai-internal"),
        AI_BOT_ENABLED=os.environ.get("AI_BOT_ENABLED", "1"),
        AI_BOT_MODEL=os.environ.get("AI_BOT_MODEL", "gpt-4o-mini"),
        AI_BOT_SYSTEM_PROMPT=os.environ.get(
            "AI_BOT_SYSTEM_PROMPT",
            "You are a concise, helpful assistant inside a chat app.",
        ),
        OPENAI_API_KEY=os.environ.get("OPENAI_API_KEY", ""),
    )
    if test_config:
        app.config.update(test_config)

    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)

    @app.after_request
    def add_dev_cors_headers(response):
        allowed_origins = {"http://127.0.0.1:5173", "http://localhost:5173"}
        request_origin = request.headers.get("Origin")
        if request_origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = request_origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            )
            response.headers["Vary"] = "Origin"
        if (
            request.method in {"POST", "PUT", "PATCH", "DELETE"}
            and response.status_code < 500
            and not request.path.startswith("/static/")
        ):
            maybe_backup_database(app.config)
        return response

    init_app(app)
    db.init_app(app)
    login_manager.init_app(app)
    socketio.init_app(
        app,
        cors_allowed_origins="*",
        async_mode=None,
    )
    login_manager.login_view = "main.login"

    @app.context_processor
    def inject_app_context():
        current_language = normalize_language(getattr(g, "language", DEFAULT_LANGUAGE))
        current_currency = normalize_currency(getattr(g, "currency", DEFAULT_CURRENCY))
        current_timezone = normalize_timezone(getattr(g, "timezone", DEFAULT_TIMEZONE))
        return {
            "t": lambda key: t(key, current_language),
            "language_options": LANGUAGE_OPTIONS,
            "currency_options": CURRENCY_OPTIONS,
            "current_language": current_language,
            "current_currency": current_currency,
            "current_timezone": current_timezone,
            "current_currency_symbol": CURRENCY_OPTIONS[current_currency]["symbol"],
        }

    from .routes import bp
    from .sockets import register_socket_events

    app.register_blueprint(bp)
    register_socket_events(socketio)

    with app.app_context():
        from . import models  # noqa: F401

        restored_from = restore_latest_backup_if_needed(app.config)
        if restored_from:
            app.logger.info("Restored database from backup: %s", restored_from)
        db.create_all()
        init_db()
        migrated = migrate_json_if_needed(Path(app.config["JSON_IMPORT_PATH"]))
        if migrated:
            app.logger.info("Migrated %s expenses from JSON", migrated)

    return app
