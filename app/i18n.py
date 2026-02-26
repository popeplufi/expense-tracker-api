from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_LANGUAGE = "en"
DEFAULT_CURRENCY = "NGN"
DEFAULT_TIMEZONE = "UTC"

LANGUAGE_OPTIONS = {
    "en": "English",
    "es": "Espanol",
    "fr": "Francais",
}

CURRENCY_OPTIONS = {
    "NGN": {"symbol": "₦", "rate_from_ngn": 1.0},
    "USD": {"symbol": "$", "rate_from_ngn": 0.00066},
    "EUR": {"symbol": "€", "rate_from_ngn": 0.00061},
    "GBP": {"symbol": "£", "rate_from_ngn": 0.00052},
}

TRANSLATIONS = {
    "en": {
        "app_name": "Expense Tracker Pro",
        "nav_login": "Login",
        "nav_register": "Register",
        "nav_profile": "Profile",
        "nav_logout": "Logout",
        "hero_kicker": "Structured Finance System",
        "hero_subtitle": "Flask + SQLite with auth, analytics, and persistent multi-user storage.",
        "filters": "Filters",
        "add_expense": "Add Expense",
        "category": "Category",
        "all_categories": "All Categories",
        "month": "Month",
        "apply": "Apply",
        "clear": "Clear",
        "totals": "Totals",
        "filtered_total": "Filtered Total",
        "overall_total": "Overall Total",
        "analytics_dashboard": "Analytics Dashboard",
        "pie_by_category": "Pie by Category",
        "bar_by_month": "Bar by Month",
        "spending_trend": "Spending Trend",
        "chart_empty_category": "Add expenses to see category distribution.",
        "chart_empty_month": "Monthly totals appear once data exists.",
        "chart_empty_trend": "Trend line appears after adding dated expenses.",
        "expenses": "Expenses",
        "name": "Name",
        "date": "Date",
        "amount": "Amount",
        "action": "Action",
        "delete": "Delete",
        "no_expenses_view": "No expenses match this view yet.",
        "load_more": "Load More",
        "monthly_summary": "Monthly Summary",
        "monthly_empty": "Monthly summary will appear after you add expenses.",
        "add_expense_modal": "Add Expense",
        "delete_expense_modal": "Delete Expense",
        "save_expense": "Save Expense",
        "saving": "Saving",
        "loading": "Loading",
        "deleting": "Deleting",
        "cancel": "Cancel",
        "login": "Login",
        "register": "Create Account",
        "username": "Username",
        "password": "Password",
        "confirm_password": "Confirm Password",
        "new_here": "New here?",
        "already_have": "Already have an account?",
        "profile": "Profile",
        "back_dashboard": "Back To Dashboard",
        "total_expenses": "Total Expenses",
        "total_spent": "Total Spent",
        "first_expense": "First Expense",
        "latest_expense": "Latest Expense",
        "top_category": "Top Category",
        "no_expenses_yet": "No expenses yet.",
    },
    "es": {
        "app_name": "Expense Tracker Pro",
        "nav_login": "Iniciar sesion",
        "nav_register": "Registrarse",
        "nav_profile": "Perfil",
        "nav_logout": "Cerrar sesion",
        "hero_kicker": "Sistema financiero estructurado",
        "hero_subtitle": "Flask + SQLite con autenticacion, analitica y almacenamiento persistente multiusuario.",
        "filters": "Filtros",
        "add_expense": "Agregar gasto",
        "category": "Categoria",
        "all_categories": "Todas las categorias",
        "month": "Mes",
        "apply": "Aplicar",
        "clear": "Limpiar",
        "totals": "Totales",
        "filtered_total": "Total filtrado",
        "overall_total": "Total general",
        "analytics_dashboard": "Panel analitico",
        "pie_by_category": "Grafico circular por categoria",
        "bar_by_month": "Grafico de barras por mes",
        "spending_trend": "Tendencia de gastos",
        "chart_empty_category": "Agrega gastos para ver la distribucion por categoria.",
        "chart_empty_month": "Los totales mensuales apareceran cuando haya datos.",
        "chart_empty_trend": "La tendencia aparecera despues de agregar gastos con fecha.",
        "expenses": "Gastos",
        "name": "Nombre",
        "date": "Fecha",
        "amount": "Monto",
        "action": "Accion",
        "delete": "Eliminar",
        "no_expenses_view": "No hay gastos para esta vista.",
        "load_more": "Cargar mas",
        "monthly_summary": "Resumen mensual",
        "monthly_empty": "El resumen mensual aparecera despues de agregar gastos.",
        "add_expense_modal": "Agregar gasto",
        "delete_expense_modal": "Eliminar gasto",
        "save_expense": "Guardar gasto",
        "saving": "Guardando",
        "loading": "Cargando",
        "deleting": "Eliminando",
        "cancel": "Cancelar",
        "login": "Iniciar sesion",
        "register": "Crear cuenta",
        "username": "Usuario",
        "password": "Contrasena",
        "confirm_password": "Confirmar contrasena",
        "new_here": "Nuevo aqui?",
        "already_have": "Ya tienes cuenta?",
        "profile": "Perfil",
        "back_dashboard": "Volver al panel",
        "total_expenses": "Total de gastos",
        "total_spent": "Total gastado",
        "first_expense": "Primer gasto",
        "latest_expense": "Ultimo gasto",
        "top_category": "Categoria principal",
        "no_expenses_yet": "Aun no hay gastos.",
    },
    "fr": {
        "app_name": "Expense Tracker Pro",
        "nav_login": "Connexion",
        "nav_register": "Inscription",
        "nav_profile": "Profil",
        "nav_logout": "Deconnexion",
        "hero_kicker": "Systeme financier structure",
        "hero_subtitle": "Flask + SQLite avec authentification, analyses et stockage persistant multi-utilisateur.",
        "filters": "Filtres",
        "add_expense": "Ajouter une depense",
        "category": "Categorie",
        "all_categories": "Toutes les categories",
        "month": "Mois",
        "apply": "Appliquer",
        "clear": "Effacer",
        "totals": "Totaux",
        "filtered_total": "Total filtre",
        "overall_total": "Total general",
        "analytics_dashboard": "Tableau analytique",
        "pie_by_category": "Camembert par categorie",
        "bar_by_month": "Barres par mois",
        "spending_trend": "Tendance des depenses",
        "chart_empty_category": "Ajoutez des depenses pour voir la repartition par categorie.",
        "chart_empty_month": "Les totaux mensuels apparaissent lorsqu'il y a des donnees.",
        "chart_empty_trend": "La tendance apparait apres des depenses datees.",
        "expenses": "Depenses",
        "name": "Nom",
        "date": "Date",
        "amount": "Montant",
        "action": "Action",
        "delete": "Supprimer",
        "no_expenses_view": "Aucune depense pour cette vue.",
        "load_more": "Charger plus",
        "monthly_summary": "Resume mensuel",
        "monthly_empty": "Le resume mensuel apparaitra apres ajout de depenses.",
        "add_expense_modal": "Ajouter une depense",
        "delete_expense_modal": "Supprimer la depense",
        "save_expense": "Enregistrer",
        "saving": "Enregistrement",
        "loading": "Chargement",
        "deleting": "Suppression",
        "cancel": "Annuler",
        "login": "Connexion",
        "register": "Creer un compte",
        "username": "Nom d'utilisateur",
        "password": "Mot de passe",
        "confirm_password": "Confirmer le mot de passe",
        "new_here": "Nouveau ici?",
        "already_have": "Vous avez deja un compte?",
        "profile": "Profil",
        "back_dashboard": "Retour au tableau",
        "total_expenses": "Nombre de depenses",
        "total_spent": "Total depense",
        "first_expense": "Premiere depense",
        "latest_expense": "Derniere depense",
        "top_category": "Categorie principale",
        "no_expenses_yet": "Aucune depense pour le moment.",
    },
}


def normalize_language(language):
    if language in LANGUAGE_OPTIONS:
        return language
    return DEFAULT_LANGUAGE


def normalize_currency(currency):
    if currency in CURRENCY_OPTIONS:
        return currency
    return DEFAULT_CURRENCY


def normalize_timezone(timezone):
    value = str(timezone or "").strip()
    if not value:
        return DEFAULT_TIMEZONE
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError:
        return DEFAULT_TIMEZONE
    return value


def t(key, language):
    lang = normalize_language(language)
    return TRANSLATIONS.get(lang, {}).get(key, TRANSLATIONS["en"].get(key, key))


def convert_from_ngn(amount, currency):
    code = normalize_currency(currency)
    rate = CURRENCY_OPTIONS[code]["rate_from_ngn"]
    return float(amount) * float(rate)


def convert_to_ngn(amount, currency):
    code = normalize_currency(currency)
    rate = CURRENCY_OPTIONS[code]["rate_from_ngn"]
    if rate == 0:
        return float(amount)
    return float(amount) / float(rate)
