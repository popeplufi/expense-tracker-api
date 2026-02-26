from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import (
    Blueprint,
    current_app,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from flask_login import current_user, login_user, logout_user
from jwt import ExpiredSignatureError, InvalidTokenError
from werkzeug.security import check_password_hash, generate_password_hash

from . import db, repository
from .i18n import (
    CURRENCY_OPTIONS,
    DEFAULT_CURRENCY,
    DEFAULT_LANGUAGE,
    DEFAULT_TIMEZONE,
    convert_from_ngn,
    convert_to_ngn,
    normalize_currency,
    normalize_language,
    normalize_timezone,
)
from .models import User
from .services import claim_legacy_expenses_for_user

bp = Blueprint("main", __name__)
PAGE_SIZE_DEFAULT = 20
PAGE_SIZE_MAX = 100
JWT_ALGORITHM = "HS256"


def _jwt_expiration_minutes():
    raw_minutes = current_app.config.get("JWT_EXPIRES_MINUTES", "10080")
    try:
        return max(1, int(raw_minutes))
    except (TypeError, ValueError):
        return 10080


def _create_jwt(user_id):
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(minutes=_jwt_expiration_minutes())
    payload = {
        "sub": str(user_id),
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET_KEY"], algorithm=JWT_ALGORITHM)


def _parse_bearer_token():
    authorization = request.headers.get("Authorization", "")
    if not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    return token or None


def _user_from_token(token):
    if not token:
        return None, None
    try:
        payload = jwt.decode(
            token,
            current_app.config["JWT_SECRET_KEY"],
            algorithms=[JWT_ALGORITHM],
        )
    except ExpiredSignatureError:
        return None, "Token has expired."
    except InvalidTokenError:
        return None, "Invalid token."

    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        return None, "Invalid token payload."

    user = repository.get_user_by_id(user_id)
    if not user:
        return None, "User not found."
    return user, None


def _api_user_payload(user):
    return {
        "id": user["id"],
        "username": user["username"],
        "created_at": user["created_at"],
    }


def _amount_for_currency(value_ngn, currency_code):
    return round(convert_from_ngn(value_ngn, currency_code), 2)


def _parse_int(value, default, minimum=None, maximum=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default

    if minimum is not None and parsed < minimum:
        parsed = minimum
    if maximum is not None and parsed > maximum:
        parsed = maximum
    return parsed


def _dashboard_payload(
    user_id,
    category_filter=None,
    month_filter=None,
    currency_code=None,
    limit=PAGE_SIZE_DEFAULT,
    offset=0,
):
    currency = normalize_currency(currency_code or DEFAULT_CURRENCY)
    limit = _parse_int(limit, PAGE_SIZE_DEFAULT, minimum=1, maximum=PAGE_SIZE_MAX)
    offset = _parse_int(offset, 0, minimum=0)
    total_matching = repository.count_expenses(
        user_id=user_id, category=category_filter, month=month_filter
    )

    expenses_raw = repository.list_expenses(
        user_id=user_id,
        category=category_filter,
        month=month_filter,
        limit=limit,
        offset=offset,
    )
    categories = repository.list_categories(user_id=user_id)
    monthly_summary_raw = repository.monthly_summary(user_id=user_id)
    category_summary_raw = repository.category_summary(user_id=user_id)
    trend_summary_raw = repository.spending_trend(user_id=user_id)
    monthly_chart = list(reversed(monthly_summary_raw))

    expenses = []
    for expense in expenses_raw:
        item = dict(expense)
        item["amount"] = _amount_for_currency(item["amount"], currency)
        expenses.append(item)

    monthly_summary = []
    for row in monthly_summary_raw:
        item = dict(row)
        item["total"] = _amount_for_currency(item["total"], currency)
        monthly_summary.append(item)

    category_summary = []
    for row in category_summary_raw:
        item = dict(row)
        item["total"] = _amount_for_currency(item["total"], currency)
        category_summary.append(item)

    trend_summary = []
    for row in trend_summary_raw:
        item = dict(row)
        item["total"] = _amount_for_currency(item["total"], currency)
        trend_summary.append(item)

    totals = {
        "filtered": _amount_for_currency(
            repository.total_amount(
                user_id=user_id,
                category=category_filter,
                month=month_filter,
            ),
            currency,
        ),
        "overall": _amount_for_currency(repository.total_amount(user_id=user_id), currency),
    }

    chart_data = {
        "categories": category_summary,
        "months": [
            {"month": row["month"], "total": _amount_for_currency(row["total"], currency)}
            for row in monthly_chart
        ],
        "trend": trend_summary,
    }

    return {
        "expenses": expenses,
        "categories": categories,
        "monthly_summary": monthly_summary,
        "totals": totals,
        "chart_data": chart_data,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "returned": len(expenses),
            "total": total_matching,
            "next_offset": offset + len(expenses),
            "has_more": (offset + len(expenses)) < total_matching,
        },
        "currency": {
            "code": currency,
            "symbol": CURRENCY_OPTIONS[currency]["symbol"],
        },
    }


@bp.before_app_request
def load_preferences():
    language = normalize_language(session.get("language"))
    currency = normalize_currency(session.get("currency"))
    timezone = normalize_timezone(session.get("timezone"))

    session["language"] = language
    session["currency"] = currency
    session["timezone"] = timezone

    g.language = language
    g.currency = currency
    g.timezone = timezone


@bp.before_app_request
def load_logged_in_user():
    g.auth_error = None

    if request.path.startswith("/api/"):
        token = _parse_bearer_token()
        if token:
            user, token_error = _user_from_token(token)
            if user is not None:
                g.user = user
            else:
                g.user = None
                g.auth_error = token_error or "Unauthorized."
            return

    if current_user.is_authenticated:
        user = repository.get_user_by_id(int(current_user.get_id()))
        if user:
            g.user = user
        else:
            g.user = {
                "id": int(current_user.get_id()),
                "username": current_user.username,
                "created_at": None,
            }
        return

    user_id = session.get("user_id")
    if user_id is None:
        g.user = None
    else:
        g.user = repository.get_user_by_id(user_id)


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if request.path.startswith("/api/") and request.method == "OPTIONS":
            return "", 204

        if g.user is None:
            if request.path.startswith("/api/"):
                return (
                    jsonify(
                        {
                            "ok": False,
                            "message": getattr(g, "auth_error", None) or "Unauthorized",
                        }
                    ),
                    401,
                )
            flash("Please log in to continue.", "error")
            return redirect(url_for("main.login"))
        return view(*args, **kwargs)

    return wrapped_view


@bp.route("/register", methods=["GET", "POST"])
def register():
    if g.user:
        return redirect(url_for("main.dashboard"))

    if request.method == "POST":
        username = request.form["username"].strip()
        password_raw = request.form["password"]
        confirm_password = request.form.get("confirm_password", "")

        if len(username) < 3:
            flash("Username must be at least 3 characters.", "error")
            return render_template("register.html")
        if len(password_raw) < 6:
            flash("Password must be at least 6 characters.", "error")
            return render_template("register.html")
        if confirm_password and password_raw != confirm_password:
            flash("Passwords do not match.", "error")
            return render_template("register.html")
        if User.query.filter_by(username=username).first():
            flash("Username is already taken.", "error")
            return render_template("register.html")

        password = generate_password_hash(password_raw)
        new_user = User(username=username, password=password)
        db.session.add(new_user)
        db.session.commit()
        user_id = new_user.id

        if repository.count_users() == 1:
            claimed = claim_legacy_expenses_for_user(user_id)
            if claimed:
                flash(f"Imported {claimed} legacy expenses into your account.", "success")

        flash("Registration successful. Please log in.", "success")
        return redirect(url_for("main.login"))

    return render_template("register.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if g.user:
        return redirect(url_for("main.dashboard"))

    if request.method == "POST":
        user = User.query.filter_by(username=request.form["username"].strip()).first()

        if user and check_password_hash(user.password, request.form["password"]):
            login_user(user)
            session["user_id"] = user.id
            flash("Welcome back.", "success")
            return redirect(url_for("main.dashboard"))

        flash("Invalid username or password.", "error")

    return render_template("login.html")


@bp.post("/logout")
def logout():
    logout_user()
    session.pop("user_id", None)
    flash("Logged out.", "success")
    return redirect(url_for("main.login"))


@bp.post("/api/auth/register")
@bp.post("/api/register")
def api_register():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    confirm_password = str(payload.get("confirm_password", ""))

    if len(username) < 3:
        return jsonify({"ok": False, "message": "Username must be at least 3 characters."}), 400
    if len(password) < 6:
        return jsonify({"ok": False, "message": "Password must be at least 6 characters."}), 400
    if confirm_password and password != confirm_password:
        return jsonify({"ok": False, "message": "Passwords do not match."}), 400
    if repository.get_user_by_username(username):
        return jsonify({"ok": False, "message": "Username is already taken."}), 409

    password_hash = generate_password_hash(password)
    user_id = repository.create_user(username, password_hash)

    if repository.count_users() == 1:
        claim_legacy_expenses_for_user(user_id)

    user = repository.get_user_by_id(user_id)
    token = _create_jwt(user_id)
    return (
        jsonify(
            {
                "ok": True,
                "message": "Registration successful.",
                "token": token,
                "user": _api_user_payload(user),
            }
        ),
        201,
    )


@bp.post("/api/auth/login")
@bp.post("/api/login")
def api_login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))

    if not username or not password:
        return jsonify({"ok": False, "message": "Username and password are required."}), 400

    user = repository.get_user_by_username(username)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"ok": False, "message": "Invalid username or password."}), 401

    token = _create_jwt(user["id"])
    return jsonify(
        {
            "ok": True,
            "message": "Login successful.",
            "token": token,
            "user": _api_user_payload(user),
        }
    )


@bp.get("/api/auth/me")
@login_required
def api_auth_me():
    return jsonify({"ok": True, "user": _api_user_payload(g.user)})


@bp.get("/profile")
@login_required
def profile():
    stats = repository.profile_stats(g.user["id"])
    stats["total_spent"] = _amount_for_currency(stats["total_spent"], g.currency)
    if stats["top_category"]:
        stats["top_category"]["total"] = _amount_for_currency(
            stats["top_category"]["total"], g.currency
        )
    return render_template("profile.html", stats=stats)


@bp.get("/")
@bp.get("/dashboard")
@login_required
def dashboard():
    selected_category = request.args.get("category", "").strip()
    selected_month = request.args.get("month", "").strip()
    category_filter = selected_category or None
    month_filter = selected_month or None

    dashboard = _dashboard_payload(
        user_id=g.user["id"],
        category_filter=category_filter,
        month_filter=month_filter,
        currency_code=g.currency,
        limit=PAGE_SIZE_DEFAULT,
        offset=0,
    )
    current_month = date.today().strftime("%Y-%m")
    monthly_total = 0
    for row in dashboard["monthly_summary"]:
        if row.get("month") == current_month:
            monthly_total = row.get("total", 0)
            break
    expenses = dashboard["expenses"]

    category_data = defaultdict(float)
    for expense in expenses:
        category_data[expense["category"]] += expense["amount"]

    labels = list(category_data.keys())
    values = list(category_data.values())
    total = dashboard["totals"]["overall"]

    return render_template(
        "dashboard.html",
        expenses=expenses,
        total=total,
        monthly_total=monthly_total,
        labels=labels,
        values=values,
    )


@bp.get("/frontend")
def frontend():
    return render_template("frontend.html")


@bp.post("/expenses")
@login_required
def create_expense():
    name = request.form.get("name", "").strip()
    amount_raw = request.form.get("amount", "").strip()
    category = request.form.get("category", "").strip() or "Uncategorized"
    expense_date_raw = request.form.get("expense_date", "").strip()

    if not name:
        flash("Expense name is required.", "error")
        return redirect(url_for("main.dashboard"))

    try:
        amount_input = float(amount_raw)
    except ValueError:
        flash("Amount must be a number.", "error")
        return redirect(url_for("main.dashboard"))

    if amount_input <= 0:
        flash("Amount must be greater than zero.", "error")
        return redirect(url_for("main.dashboard"))

    if expense_date_raw:
        try:
            expense_date = date.fromisoformat(expense_date_raw).isoformat()
        except ValueError:
            flash("Date must be in YYYY-MM-DD format.", "error")
            return redirect(url_for("main.dashboard"))
    else:
        expense_date = date.today().isoformat()

    repository.add_expense(
        user_id=g.user["id"],
        name=name,
        amount=convert_to_ngn(amount_input, g.currency),
        category=category,
        expense_date=expense_date,
    )
    flash("Expense added successfully.", "success")
    return redirect(url_for("main.dashboard", success=1))


@bp.post("/expenses/<int:expense_id>/delete")
@login_required
def delete_expense(expense_id):
    selected_category = request.form.get("selected_category", "").strip()
    selected_month = request.form.get("selected_month", "").strip()

    deleted = repository.delete_expense(g.user["id"], expense_id)
    if deleted:
        flash("Expense deleted.", "success")
    else:
        flash("Expense not found.", "error")

    params = {}
    if selected_category:
        params["category"] = selected_category
    if selected_month:
        params["month"] = selected_month

    return redirect(url_for("main.dashboard", **params))


@bp.post("/api/preferences")
def api_preferences():
    payload = request.get_json(silent=True) or {}

    if "language" in payload:
        session["language"] = normalize_language(payload.get("language"))
    if "currency" in payload:
        session["currency"] = normalize_currency(payload.get("currency"))
    if "timezone" in payload:
        session["timezone"] = normalize_timezone(payload.get("timezone"))

    language = normalize_language(session.get("language", DEFAULT_LANGUAGE))
    currency = normalize_currency(session.get("currency", DEFAULT_CURRENCY))
    timezone = normalize_timezone(session.get("timezone", DEFAULT_TIMEZONE))

    session["language"] = language
    session["currency"] = currency
    session["timezone"] = timezone

    return jsonify(
        {
            "ok": True,
            "preferences": {
                "language": language,
                "currency": currency,
                "timezone": timezone,
                "currency_symbol": CURRENCY_OPTIONS[currency]["symbol"],
            },
        }
    )


@bp.get("/api/dashboard")
@login_required
def api_dashboard():
    selected_category = request.args.get("category", "").strip()
    selected_month = request.args.get("month", "").strip()
    category_filter = selected_category or None
    month_filter = selected_month or None
    limit = _parse_int(
        request.args.get("limit"), PAGE_SIZE_DEFAULT, minimum=1, maximum=PAGE_SIZE_MAX
    )
    offset = _parse_int(request.args.get("offset"), 0, minimum=0)

    dashboard = _dashboard_payload(
        user_id=g.user["id"],
        category_filter=category_filter,
        month_filter=month_filter,
        currency_code=g.currency,
        limit=limit,
        offset=offset,
    )
    dashboard["selected_category"] = selected_category
    dashboard["selected_month"] = selected_month
    dashboard["preferences"] = {
        "language": g.language,
        "currency": g.currency,
        "timezone": g.timezone,
    }
    return jsonify(dashboard)


@bp.get("/api/expenses")
@login_required
def api_expenses():
    selected_category = request.args.get("category", "").strip()
    selected_month = request.args.get("month", "").strip()
    category_filter = selected_category or None
    month_filter = selected_month or None
    limit = _parse_int(
        request.args.get("limit"), PAGE_SIZE_DEFAULT, minimum=1, maximum=PAGE_SIZE_MAX
    )
    offset = _parse_int(request.args.get("offset"), 0, minimum=0)
    currency = normalize_currency(g.currency)

    expenses_raw = repository.list_expenses(
        user_id=g.user["id"],
        category=category_filter,
        month=month_filter,
        limit=limit,
        offset=offset,
    )
    total_matching = repository.count_expenses(
        user_id=g.user["id"], category=category_filter, month=month_filter
    )

    expenses = []
    for expense in expenses_raw:
        item = dict(expense)
        item["amount"] = _amount_for_currency(item["amount"], currency)
        expenses.append(item)

    simple = str(request.args.get("simple", "")).strip().lower()
    if simple in {"1", "true", "yes"}:
        return jsonify(expenses)

    return jsonify(
        {
            "ok": True,
            "expenses": expenses,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "returned": len(expenses),
                "total": total_matching,
                "next_offset": offset + len(expenses),
                "has_more": (offset + len(expenses)) < total_matching,
            },
            "currency": {
                "code": currency,
                "symbol": CURRENCY_OPTIONS[currency]["symbol"],
            },
        }
    )


@bp.post("/api/expenses")
@login_required
def api_create_expense():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    amount_raw = str(payload.get("amount", "")).strip()
    category = str(payload.get("category", "")).strip() or "Uncategorized"
    expense_date_raw = str(payload.get("expense_date", "")).strip()

    if not name:
        return jsonify({"ok": False, "message": "Expense name is required."}), 400

    try:
        amount_input = float(amount_raw)
    except ValueError:
        return jsonify({"ok": False, "message": "Amount must be a number."}), 400

    if amount_input <= 0:
        return jsonify({"ok": False, "message": "Amount must be greater than zero."}), 400

    if expense_date_raw:
        try:
            expense_date = date.fromisoformat(expense_date_raw).isoformat()
        except ValueError:
            return jsonify({"ok": False, "message": "Date must be in YYYY-MM-DD format."}), 400
    else:
        expense_date = date.today().isoformat()

    expense_id = repository.add_expense(
        user_id=g.user["id"],
        name=name,
        amount=convert_to_ngn(amount_input, g.currency),
        category=category,
        expense_date=expense_date,
    )
    return jsonify(
        {
            "ok": True,
            "message": "Expense added successfully.",
            "expense_id": expense_id,
        }
    )


@bp.delete("/api/expenses/<int:expense_id>")
@login_required
def api_delete_expense(expense_id):
    deleted = repository.delete_expense(g.user["id"], expense_id)
    if deleted:
        return jsonify({"ok": True, "message": "Expense deleted."})
    return jsonify({"ok": False, "message": "Expense not found."}), 404
