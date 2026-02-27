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

  const categorySpending = useMemo(() => {
    const map = {};
    for (const expense of expenses) {
      const category = expense.category || "Uncategorized";
      map[category] = (map[category] || 0) + Number(expense.amount || 0);
    }
    return Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [expenses]);

  const budgetTarget = useMemo(() => {
    if (summary.monthly <= 0) {
      return 300000;
    }
    return Math.max(Math.round(summary.monthly * 1.1), 50000);
  }, [summary.monthly]);

  const budgetProgress = Math.min((summary.monthly / budgetTarget) * 100, 100);

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
      <div className="grid gap-5">
        <div className="surface-card h-44 animate-pulse" />
        <div className="surface-card h-80 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <section className="surface-card">
        <p className="text-base font-semibold text-red-600 dark:text-red-300">Unable to load feed</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error}</p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-4 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="surface-card overflow-hidden">
        <div className="hero-strip" />
        <div className="relative -mt-6">
          <h1 className="font-display text-3xl font-semibold text-slate-900 dark:text-white">
            Dashboard Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            A clear view of spending, budget progress, and category performance.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <motion.article whileHover={{ y: -3 }} transition={{ duration: 0.2 }} className="stat-card">
            <p className="stat-card__label">Total spent</p>
            <p className="stat-card__value text-brand-700 dark:text-brand-300">{formatAmount(summary.total)}</p>
          </motion.article>
          <motion.article whileHover={{ y: -3 }} transition={{ duration: 0.2 }} className="stat-card">
            <p className="stat-card__label">This month</p>
            <p className="stat-card__value text-ocean-700 dark:text-ocean-300">{formatAmount(summary.monthly)}</p>
          </motion.article>
          <motion.article whileHover={{ y: -3 }} transition={{ duration: 0.2 }} className="stat-card">
            <p className="stat-card__label">Categories</p>
            <p className="stat-card__value">{summary.categories}</p>
          </motion.article>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="surface-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Budget health</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Monthly spending against your planned budget.
              </p>
            </div>
            <span className="feed-chip">This month</span>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">
                {formatAmount(summary.monthly)} spent
              </span>
              <span className="font-medium">{formatAmount(budgetTarget)} target</span>
            </div>
            <div className="h-3 rounded-full bg-slate-200/80 dark:bg-slate-700">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${budgetProgress}%` }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="h-3 rounded-full bg-gradient-to-r from-ocean-500 to-brand-500"
              />
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            {budgetProgress >= 100
              ? "You are at or above budget for this month."
              : `${Math.round(100 - budgetProgress)}% of budget remains.`}
          </p>
        </article>

        <article className="surface-card">
          <h2 className="font-display text-xl font-semibold">Top categories</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Biggest expense categories this period.
          </p>
          <div className="mt-5 space-y-4">
            {categorySpending.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-300">No category data yet.</p>
            ) : (
              categorySpending.map((item) => {
                const max = categorySpending[0]?.total || 1;
                const width = Math.max((item.total / max) * 100, 8);
                return (
                  <div key={item.name}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-slate-600 dark:text-slate-300">{formatAmount(item.total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-700">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${width}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-ocean-500"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </section>

      <section className="surface-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Recent transactions</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Latest entries sorted by date, with category and amount.
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
            No expenses yet. Add one and refresh this feed.
          </p>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
            className="grid gap-4"
          >
            {recentExpenses.map((expense) => (
              <motion.article
                key={expense.id}
                variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                whileHover={{ y: -2 }}
                className="feed-card transaction-card"
              >
                <div className="feed-card__top">
                  <div className="feed-avatar">
                    {(expense.name || "E").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold">{expense.name || "Untitled expense"}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-300">{formatDate(expense.expense_date)}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="feed-chip">{expense.category || "Uncategorized"}</span>
                  <p className="font-display text-xl font-semibold text-brand-700 dark:text-brand-300">
                    {formatAmount(expense.amount)}
                  </p>
                </div>
              </motion.article>
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}

export default DashboardPage;
