import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import DashboardPage from "./pages/DashboardPage.jsx";
import InsightsPage from "./pages/InsightsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5001";
const THEME_STORAGE_KEY = "expense_theme";
const TOKEN_STORAGE_KEY = "expense_jwt_token";

function readPreferredTheme() {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark" || saved === "light") {
    return saved;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function authHeaders(token) {
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

function AnimatedPage({ children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.section>
  );
}

function TrendStat({ label, value }) {
  return (
    <article className="social-stat">
      <p className="social-stat__label">{label}</p>
      <p className="social-stat__value">{value}</p>
    </article>
  );
}

function ProtectedRoute({ isReady, isAuthenticated, children }) {
  if (!isReady) {
    return (
      <section className="surface-card">
        <p className="text-sm text-slate-600 dark:text-slate-300">Checking your session...</p>
      </section>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }
  return children;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(readPreferredTheme);
  const [token, setToken] = useState(readStoredToken);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const persistToken = useCallback((nextToken) => {
    if (nextToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      setToken(nextToken);
      return;
    }
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
  }, []);

  const clearAuth = useCallback(() => {
    persistToken("");
    setUser(null);
    setExpenses([]);
    setError("");
    setLoading(false);
  }, [persistToken]);

  const onAuthSuccess = useCallback(
    (authData) => {
      if (!authData?.token || !authData?.user) {
        return;
      }
      persistToken(authData.token);
      setUser(authData.user);
      setAuthReady(true);
      navigate("/", { replace: true });
    },
    [navigate, persistToken]
  );

  const loadExpenses = useCallback(async () => {
    if (!token) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses?simple=1`, {
        headers: authHeaders(token),
      });

      if (response.status === 401) {
        clearAuth();
        throw new Error("Session expired. Please log in again.");
      }
      if (!response.ok) {
        throw new Error(`Unable to load expenses (${response.status}).`);
      }

      const data = await response.json();
      const normalized = Array.isArray(data)
        ? data
        : Array.isArray(data.expenses)
          ? data.expenses
          : [];
      setExpenses(normalized);
    } catch (err) {
      setError(err.message || "Unable to load expenses.");
    } finally {
      setLoading(false);
    }
  }, [token, clearAuth]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function validateToken() {
      if (!token) {
        if (!cancelled) {
          setUser(null);
          setAuthReady(true);
        }
        return;
      }

      if (!cancelled) {
        setAuthReady(false);
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: authHeaders(token),
        });
        if (!response.ok) {
          throw new Error("Token is not valid.");
        }
        const data = await response.json();
        if (!cancelled) {
          setUser(data.user || null);
        }
      } catch (_err) {
        if (!cancelled) {
          clearAuth();
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    validateToken();
    return () => {
      cancelled = true;
    };
  }, [token, clearAuth]);

  useEffect(() => {
    if (!authReady) {
      return;
    }
    if (!token || !user) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    loadExpenses();
  }, [authReady, token, user, loadExpenses]);

  const topCategory = useMemo(() => {
    if (!expenses.length) {
      return "No data";
    }
    const totals = expenses.reduce((acc, expense) => {
      const key = expense.category || "Uncategorized";
      acc[key] = (acc[key] || 0) + Number(expense.amount || 0);
      return acc;
    }, {});
    return Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
  }, [expenses]);

  const monthlyTotal = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return expenses
      .filter((expense) => String(expense.expense_date || "").startsWith(currentMonth))
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  }, [expenses]);

  const activeCategories = useMemo(
    () => new Set(expenses.map((expense) => expense.category || "Uncategorized")).size,
    [expenses]
  );

  const latestTransactions = useMemo(
    () =>
      [...expenses]
        .sort((a, b) => (Date.parse(b.expense_date || "") || 0) - (Date.parse(a.expense_date || "") || 0))
        .slice(0, 4),
    [expenses]
  );

  const isAuthenticated = Boolean(token && user);
  const userInitial = (user?.username || "U").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-scene text-slate-900 transition-colors dark:bg-scene-dark dark:text-slate-100">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="topbar mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-ocean-500 text-sm font-bold text-white">
              PF
            </div>
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">Plufi Budget</p>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                Smart budgeting and expense tracking
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {isAuthenticated && (
              <nav className="hidden items-center rounded-full border border-slate-200/80 bg-white/70 p-1 dark:border-slate-700 dark:bg-slate-900/70 md:flex">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `nav-chip ${
                      isActive
                        ? "bg-slate-900 text-white dark:bg-brand-500"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`
                  }
                >
                  Home
                </NavLink>
                <NavLink
                  to="/insights"
                  className={({ isActive }) =>
                    `nav-chip ${
                      isActive
                        ? "bg-slate-900 text-white dark:bg-brand-500"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`
                  }
                >
                  Insights
                </NavLink>
              </nav>
            )}

            <button
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow dark:border-slate-700 dark:bg-slate-900/75"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>

            {isAuthenticated && (
              <button
                type="button"
                onClick={() => {
                  clearAuth();
                  navigate("/auth/login", { replace: true });
                }}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Logout
              </button>
            )}

            {isAuthenticated && (
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-ocean-500 to-brand-500 text-sm font-bold text-white">
                {userInitial}
              </div>
            )}
          </div>
        </motion.header>

        <div className={isAuthenticated ? "social-layout" : "social-layout social-layout--auth"}>
          {isAuthenticated && (
            <motion.aside
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05, duration: 0.3 }}
              className="surface-card hidden xl:block"
            >
              <p className="sidebar-heading">Menu</p>
              <nav className="mt-4 grid gap-2">
                <NavLink to="/" end className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
                  Dashboard
                </NavLink>
                <NavLink
                  to="/insights"
                  className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
                >
                  Reports
                </NavLink>
              </nav>
              <p className="sidebar-heading mt-7">This month</p>
              <div className="mt-4 grid gap-3">
                <TrendStat label="Top category" value={topCategory} />
                <TrendStat label="This month" value={`₦${Math.round(monthlyTotal).toLocaleString()}`} />
                <TrendStat label="Categories" value={String(activeCategories)} />
              </div>
            </motion.aside>
          )}

          <main className="min-w-0">
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route
                  path="/auth/login"
                  element={
                    isAuthenticated ? (
                      <Navigate to="/" replace />
                    ) : (
                      <AnimatedPage>
                        <LoginPage apiBaseUrl={API_BASE_URL} onAuthSuccess={onAuthSuccess} />
                      </AnimatedPage>
                    )
                  }
                />
                <Route
                  path="/auth/register"
                  element={
                    isAuthenticated ? (
                      <Navigate to="/" replace />
                    ) : (
                      <AnimatedPage>
                        <RegisterPage apiBaseUrl={API_BASE_URL} onAuthSuccess={onAuthSuccess} />
                      </AnimatedPage>
                    )
                  }
                />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute isReady={authReady} isAuthenticated={isAuthenticated}>
                      <AnimatedPage>
                        <DashboardPage
                          expenses={expenses}
                          loading={loading}
                          error={error}
                          onRefresh={loadExpenses}
                        />
                      </AnimatedPage>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/insights"
                  element={
                    <ProtectedRoute isReady={authReady} isAuthenticated={isAuthenticated}>
                      <AnimatedPage>
                        <InsightsPage expenses={expenses} loading={loading} error={error} />
                      </AnimatedPage>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="*"
                  element={<Navigate to={isAuthenticated ? "/" : "/auth/login"} replace />}
                />
              </Routes>
            </AnimatePresence>
          </main>

          {isAuthenticated && (
            <motion.aside
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12, duration: 0.3 }}
              className="surface-card hidden lg:block"
            >
              <p className="sidebar-heading">Latest entries</p>
              {latestTransactions.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-300">No recent transactions yet.</p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {latestTransactions.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70"
                    >
                      <p className="truncate text-sm font-semibold">{item.name || "Untitled expense"}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                        {item.category || "Uncategorized"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.aside>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
