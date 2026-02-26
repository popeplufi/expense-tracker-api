import json
from datetime import date
from pathlib import Path

from . import repository


def _parse_date(raw_date):
    if raw_date is None:
        return date.today().isoformat()

    value = str(raw_date).strip()
    if not value:
        return date.today().isoformat()

    if len(value) == 7:
        value = f"{value}-01"

    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return date.today().isoformat()


def _normalize_expense(raw_expense):
    if not isinstance(raw_expense, dict):
        return None

    name = str(raw_expense.get("name") or raw_expense.get("note") or "Expense").strip()
    if not name:
        name = "Expense"

    category = str(raw_expense.get("category") or "Uncategorized").strip()
    if not category:
        category = "Uncategorized"

    try:
        amount = float(raw_expense.get("amount", 0))
    except (TypeError, ValueError):
        return None

    if amount < 0:
        return None

    expense_date = _parse_date(
        raw_expense.get("expense_date") or raw_expense.get("date")
    )

    return {
        "name": name,
        "amount": amount,
        "category": category,
        "expense_date": expense_date,
    }


def migrate_json_if_needed(json_path: Path):
    if repository.count_all_expenses() > 0:
        return 0

    if not json_path.exists():
        return 0

    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0

    if not isinstance(payload, list):
        return 0

    inserted = 0
    for raw_expense in payload:
        normalized = _normalize_expense(raw_expense)
        if not normalized:
            continue
        repository.add_unowned_expense(**normalized)
        inserted += 1

    return inserted


def claim_legacy_expenses_for_user(user_id):
    return repository.claim_unowned_expenses(user_id)
