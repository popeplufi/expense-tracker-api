import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

_LOCK = threading.Lock()


def _resolve_backup_dir(config):
    explicit = str(config.get("BACKUP_DIR", "")).strip()
    if explicit:
        return Path(explicit)
    if Path("/var/data").exists():
        return Path("/var/data/backups")
    return Path(config["DATABASE"]).resolve().parent / "backups"


def _should_backup_now(backup_dir, min_interval_seconds):
    if min_interval_seconds <= 0:
        return True
    latest = sorted(backup_dir.glob("db-*.sqlite3"), reverse=True)
    if not latest:
        return True
    last_mtime = latest[0].stat().st_mtime
    now = datetime.now(timezone.utc).timestamp()
    return (now - last_mtime) >= min_interval_seconds


def _prune_backups(backup_dir, keep_count):
    if keep_count <= 0:
        return
    files = sorted(backup_dir.glob("db-*.sqlite3"), reverse=True)
    for old in files[keep_count:]:
        try:
            old.unlink(missing_ok=True)
        except OSError:
            continue


def maybe_backup_database(config):
    if str(config.get("AUTO_BACKUP_ENABLED", "1")) not in {"1", "true", "True", "yes", "on"}:
        return None

    database_path = Path(config["DATABASE"]).resolve()
    if not database_path.exists():
        return None

    backup_dir = _resolve_backup_dir(config)
    min_interval = int(config.get("BACKUP_MIN_INTERVAL_SECONDS", 120))
    keep_count = int(config.get("BACKUP_KEEP_COUNT", 20))

    backup_dir.mkdir(parents=True, exist_ok=True)
    if not _should_backup_now(backup_dir, min_interval):
        return None

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    target = backup_dir / f"db-{stamp}.sqlite3"

    with _LOCK:
        src = sqlite3.connect(database_path)
        dst = sqlite3.connect(target)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()

    _prune_backups(backup_dir, keep_count)
    return str(target)


def restore_latest_backup_if_needed(config):
    if str(config.get("AUTO_RESTORE_FROM_BACKUP", "1")) not in {"1", "true", "True", "yes", "on"}:
        return None

    database_path = Path(config["DATABASE"]).resolve()
    backup_dir = _resolve_backup_dir(config)
    backup_dir.mkdir(parents=True, exist_ok=True)

    db_exists_and_non_empty = database_path.exists() and database_path.stat().st_size > 0
    if db_exists_and_non_empty:
        return None

    candidates = sorted(backup_dir.glob("db-*.sqlite3"), reverse=True)
    if not candidates:
        return None

    source = candidates[0]
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with _LOCK:
        src = sqlite3.connect(source)
        dst = sqlite3.connect(database_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()

    return str(source)
