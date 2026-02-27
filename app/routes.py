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

from . import repository
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
from .session_user import SessionUser
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
        "email": user.get("email"),
        "is_online": bool(user.get("is_online", 0)),
        "last_seen": user.get("last_seen"),
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
        return redirect(url_for("main.chat_home"))

    if request.method == "POST":
        username = request.form["username"].strip()
        email = request.form.get("email", "").strip().lower() or None
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
        if repository.get_user_by_username(username):
            flash("Username is already taken.", "error")
            return render_template("register.html")
        if email and repository.get_user_by_email(email):
            flash("Email is already registered.", "error")
            return render_template("register.html")

        password = generate_password_hash(password_raw)
        user_id = repository.create_user(username, password, email=email)

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
        return redirect(url_for("main.chat_home"))

    if request.method == "POST":
        user = repository.get_user_by_username(request.form["username"].strip())

        if user and check_password_hash(user["password_hash"], request.form["password"]):
            login_user(SessionUser(user["id"], user["username"]))
            session["user_id"] = user["id"]
            repository.set_user_online(user["id"], True)
            flash("Welcome back.", "success")
            return redirect(url_for("main.chat_home"))

        flash("Invalid username or password.", "error")

    return render_template("login.html")


@bp.post("/logout")
def logout():
    if g.user:
        repository.set_user_online(g.user["id"], False)
        repository.touch_last_seen(g.user["id"])
    logout_user()
    session.pop("user_id", None)
    flash("Logged out.", "success")
    return redirect(url_for("main.login"))


@bp.post("/api/auth/register")
@bp.post("/api/register")
def api_register():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    email = str(payload.get("email", "")).strip().lower() or None
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
    if email and repository.get_user_by_email(email):
        return jsonify({"ok": False, "message": "Email is already registered."}), 409

    password_hash = generate_password_hash(password)
    user_id = repository.create_user(username, password_hash, email=email)

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

    repository.set_user_online(user["id"], True)
    user = repository.get_user_by_id(user["id"])
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
    stats = repository.chat_stats(g.user["id"])
    return render_template("profile.html", stats=stats)


@bp.get("/")
@login_required
def chat_home():
    selected_chat_raw = request.args.get("chat", "").strip()
    selected_chat_id = None
    if selected_chat_raw.isdigit():
        selected_chat_id = int(selected_chat_raw)

    chats = repository.list_user_chats(g.user["id"])
    users = repository.list_friends(g.user["id"])

    if selected_chat_id and not repository.user_in_chat(g.user["id"], selected_chat_id):
        selected_chat_id = None

    if selected_chat_id is None and chats:
        selected_chat_id = chats[0]["id"]

    messages = []
    active_chat = None
    if selected_chat_id is not None:
        active_chat = repository.get_chat(selected_chat_id)
        messages = repository.list_chat_messages(selected_chat_id, limit=200)

    return render_template(
        "chat.html",
        chats=chats,
        users=users,
        active_chat=active_chat,
        messages=messages,
        active_chat_id=selected_chat_id,
    )


@bp.get("/insights")
def legacy_insights():
    return redirect(url_for("main.chat_home"))


@bp.get("/auth/login")
def legacy_auth_login():
    return redirect(url_for("main.login"))


@bp.get("/auth/register")
def legacy_auth_register():
    return redirect(url_for("main.register"))


@bp.get("/contacts")
@login_required
def contacts_page():
    query = request.args.get("q", "").strip()
    search_results = repository.search_users_by_username(query, g.user["id"]) if query else []
    incoming_requests = repository.list_incoming_friend_requests(g.user["id"])
    friends = repository.list_friends(g.user["id"])
    outgoing_pending = repository.list_outgoing_friend_request_receiver_ids(g.user["id"])
    return render_template(
        "contacts.html",
        query=query,
        search_results=search_results,
        incoming_requests=incoming_requests,
        friends=friends,
        outgoing_pending=outgoing_pending,
    )


@bp.get("/status")
@login_required
def status_page():
    return render_template("status.html")


@bp.get("/chat/start/<int:user_id>")
@login_required
def start_direct_chat(user_id):
    if user_id == g.user["id"]:
        flash("Cannot start a chat with yourself.", "error")
        return redirect(url_for("main.chat_home"))

    target = repository.get_user_by_id(user_id)
    if not target:
        flash("User not found.", "error")
        return redirect(url_for("main.chat_home"))

    if not repository.are_friends(g.user["id"], user_id):
        flash("Only friends can message each other.", "error")
        return redirect(url_for("main.contacts_page"))

    chat_id = repository.get_or_create_direct_chat(g.user["id"], user_id)
    return redirect(url_for("main.chat_home", chat=chat_id))


@bp.post("/chat/<int:chat_id>/send")
@login_required
def send_chat_message(chat_id):
    if not repository.user_in_chat(g.user["id"], chat_id):
        flash("Chat not found.", "error")
        return redirect(url_for("main.chat_home"))

    members = repository.get_chat_member_ids(chat_id)
    if len(members) == 2:
        peer_id = members[0] if members[1] == g.user["id"] else members[1]
        if not repository.are_friends(g.user["id"], peer_id):
            flash("Only friends can message each other.", "error")
            return redirect(url_for("main.chat_home", chat=chat_id))

    body = request.form.get("body", "").strip()
    if not body:
        return redirect(url_for("main.chat_home", chat=chat_id))

    repository.create_message(chat_id, g.user["id"], body)
    return redirect(url_for("main.chat_home", chat=chat_id))


@bp.post("/friends/request/<int:user_id>")
@login_required
def send_friend_request_route(user_id):
    target = repository.get_user_by_id(user_id)
    if not target or int(target["id"]) == int(g.user["id"]):
        flash("User not found.", "error")
        return redirect(url_for("main.contacts_page"))

    result = repository.send_friend_request(g.user["id"], user_id)
    if result == "sent":
        flash("Friend request sent.", "success")
    elif result == "accepted_reciprocal":
        flash("Friend request accepted automatically. You are now friends.", "success")
    elif result == "already_friends":
        flash("You are already friends.", "success")
    elif result == "pending_exists":
        flash("A pending request already exists.", "error")
    else:
        flash("Unable to send request.", "error")
    return redirect(url_for("main.contacts_page"))


@bp.post("/friends/request/<int:request_id>/accept")
@login_required
def accept_friend_request_route(request_id):
    if repository.respond_friend_request(request_id, g.user["id"], accept=True):
        flash("Friend request accepted.", "success")
    else:
        flash("Unable to accept request.", "error")
    return redirect(url_for("main.contacts_page"))


@bp.post("/friends/request/<int:request_id>/reject")
@login_required
def reject_friend_request_route(request_id):
    if repository.respond_friend_request(request_id, g.user["id"], accept=False):
        flash("Friend request rejected.", "success")
    else:
        flash("Unable to reject request.", "error")
    return redirect(url_for("main.contacts_page"))


@bp.get("/frontend")
def frontend():
    return render_template("frontend.html")


@bp.get("/dashboard")
@login_required
def dashboard():
    dashboard_payload = _dashboard_payload(
        user_id=g.user["id"],
        currency_code=g.currency,
        limit=PAGE_SIZE_DEFAULT,
        offset=0,
    )
    expenses = dashboard_payload["expenses"]
    category_rows = dashboard_payload["chart_data"]["categories"]
    current_month = date.today().strftime("%Y-%m")
    month_total = 0
    for row in dashboard_payload["monthly_summary"]:
        if row.get("month") == current_month:
            month_total = row.get("total", 0)
            break
    category_labels = [row["name"] if "name" in row else row["category"] for row in category_rows]
    category_values = [row["total"] for row in category_rows]
    return render_template(
        "dashboard.html",
        expenses=expenses,
        total_expense=dashboard_payload["totals"]["overall"],
        month_total=month_total,
        expense_count=len(expenses),
        category_cards=category_rows[:6],
        category_labels=category_labels,
        category_values=category_values,
    )


@bp.get("/add-expense")
@login_required
def add_expense_page():
    return render_template("add_expense.html")


@bp.get("/categories")
@login_required
def categories_page():
    summary = repository.category_summary(g.user["id"])
    categories = [
        {
            "name": row["category"],
            "total": _amount_for_currency(row["total"], g.currency),
        }
        for row in summary
    ]
    return render_template("categories.html", categories=categories)


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
