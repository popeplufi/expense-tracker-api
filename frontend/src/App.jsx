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

  const isAuthenticated = Boolean(token && user);

  return (
    <div className="min-h-screen bg-mesh-light text-slate-900 transition-colors dark:bg-mesh-dark dark:text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="surface-card mb-6 flex flex-wrap items-center justify-between gap-4"
        >
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">Plufi Finance</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {isAuthenticated
                ? "JWT-secured expense feed with motion and dark mode."
                : "Login with JWT to access your private expense feed."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAuthenticated && (
              <nav className="flex items-center rounded-full border border-slate-200/80 bg-white/70 p-1 dark:border-slate-700 dark:bg-slate-900/70">
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
                  Feed
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
              {theme === "dark" ? "Switch to light" : "Switch to dark"}
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
          </div>
        </motion.header>

        {isAuthenticated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.3 }}
            className="mb-6 rounded-3xl border border-brand-200/70 bg-white/70 px-5 py-4 shadow-soft backdrop-blur-md dark:border-brand-500/30 dark:bg-slate-900/60"
          >
            <p className="text-sm text-slate-600 dark:text-slate-300">Top category right now</p>
            <p className="font-display text-2xl font-semibold text-brand-700 dark:text-brand-300">
              {topCategory}
            </p>
          </motion.div>
        )}

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
      </div>
    </div>
  );
}

export default App;
