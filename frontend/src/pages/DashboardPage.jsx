import { motion } from "framer-motion";
import { useMemo } from "react";

const currencyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function formatAmount(amount) {
  return currencyFormatter.format(Number(amount || 0));
}

function formatDate(value) {
  if (!value) {
    return "No date";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("en-NG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DashboardPage({ expenses, loading, error, onRefresh }) {
  const summary = useMemo(() => {
    const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthly = expenses
      .filter((expense) => String(expense.expense_date || "").startsWith(currentMonth))
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const categories = new Set(expenses.map((expense) => expense.category || "Uncategorized"));

    return {
      total,
      monthly,
      categories: categories.size,
    };
  }, [expenses]);

  const recentExpenses = useMemo(() => {
    return [...expenses]
      .sort((a, b) => {
        const dateA = Date.parse(a.expense_date || "") || 0;
        const dateB = Date.parse(b.expense_date || "") || 0;
        return dateB - dateA;
      })
      .slice(0, 15);
  }, [expenses]);

  if (loading) {
    return (
      <div className="container py-5">
        <div className="card shadow-lg p-4 border-0 bg-white/80 dark:bg-slate-900/75">
          <h2 className="mb-4 text-center font-display text-2xl font-semibold">
            Expense Dashboard
          </h2>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-24 animate-pulse rounded-3xl border border-slate-200/70 bg-white/70 dark:border-slate-700 dark:bg-slate-900/70"
                />
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-3xl border border-slate-200/70 bg-white/70 dark:border-slate-700 dark:bg-slate-900/70" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5">
        <div className="card shadow-lg p-4 border-0 bg-white/80 dark:bg-slate-900/75">
          <h2 className="mb-4 text-center font-display text-2xl font-semibold">
            Expense Dashboard
          </h2>
          <p className="text-base font-semibold text-red-600 dark:text-red-300">Unable to load feed</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-4 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <div className="card shadow-lg p-4 border-0 bg-white/80 dark:bg-slate-900/75">
        <h2 className="mb-4 text-center font-display text-2xl font-semibold">Expense Dashboard</h2>

        {/* your form here */}

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <motion.article
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="surface-card"
            >
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                Total spent
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-brand-700 dark:text-brand-300">
                {formatAmount(summary.total)}
              </p>
            </motion.article>

            <motion.article
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="surface-card"
            >
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                This month
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-ocean-600 dark:text-ocean-300">
                {formatAmount(summary.monthly)}
              </p>
            </motion.article>

            <motion.article
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="surface-card"
            >
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                Categories
              </p>
              <p className="mt-2 font-display text-2xl font-semibold">{summary.categories}</p>
            </motion.article>
          </div>

          <section className="surface-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Recent expenses</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Styled as clean cards with motion hover.
                </p>
              </div>

              <button
                type="button"
                onClick={onRefresh}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Refresh
              </button>
            </div>

            {recentExpenses.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300/80 p-6 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-300">
                No expenses yet. Add one from your Flask app and refresh this feed.
              </p>
            ) : (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.06 } },
                }}
                className="grid gap-3"
              >
                {recentExpenses.map((expense) => (
                  <motion.article
                    key={expense.id}
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    whileHover={{ y: -2 }}
                    className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 transition dark:border-slate-700 dark:bg-slate-900/75"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{expense.name || "Untitled expense"}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                          {formatDate(expense.expense_date)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-display text-lg font-semibold text-brand-700 dark:text-brand-300">
                          {formatAmount(expense.amount)}
                        </p>
                        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {expense.category || "Uncategorized"}
                        </span>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </motion.div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
