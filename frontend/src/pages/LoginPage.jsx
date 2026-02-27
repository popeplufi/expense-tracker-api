import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";

function LoginPage({ apiBaseUrl, onAuthSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Login failed.");
      }

      onAuthSuccess(data);
    } catch (err) {
      setError(err.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="auth-shell"
    >
      <aside className="auth-hero">
        <h1 className="font-display text-4xl font-semibold leading-tight">Welcome Back</h1>
        <p className="mt-3 text-sm text-white/85">
          Track budgets, categories, and spending trends in one clean workspace.
        </p>
      </aside>

      <div className="auth-form-panel">
        <h2 className="font-display text-2xl font-semibold">Sign in</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Secure access to your budgeting dashboard.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              className="auth-input"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="auth-input"
            />
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          No account yet?{" "}
          <Link to="/auth/register" className="font-medium text-brand-600 dark:text-brand-300">
            Create one
          </Link>
        </p>
      </div>
    </motion.section>
  );
}

export default LoginPage;
