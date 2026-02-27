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

function formatMonth(monthKey) {
  if (!monthKey) {
    return "Unknown";
  }
  const parsed = new Date(`${monthKey}-01`);
  if (Number.isNaN(parsed.getTime())) {
    return monthKey;
  }
  return parsed.toLocaleDateString("en-NG", {
    month: "short",
    year: "numeric",
  });
}

function InsightsPage({ expenses, loading, error }) {
  const { byCategory, byMonth } = useMemo(() => {
    const categoryMap = {};
    const monthMap = {};

    for (const expense of expenses) {
      const category = expense.category || "Uncategorized";
      const amount = Number(expense.amount || 0);
      const month = String(expense.expense_date || "").slice(0, 7) || "Unknown";

      categoryMap[category] = (categoryMap[category] || 0) + amount;
      monthMap[month] = (monthMap[month] || 0) + amount;
    }

    const byCategory = Object.entries(categoryMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    const byMonth = Object.entries(monthMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { byCategory, byMonth };
  }, [expenses]);

  const totalSpend = useMemo(
    () => expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [expenses]
  );
  const averageMonthly = useMemo(() => {
    const months = new Set(expenses.map((item) => String(item.expense_date || "").slice(0, 7)));
    const monthCount = Math.max(months.size, 1);
    return totalSpend / monthCount;
  }, [expenses, totalSpend]);

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-3xl border border-slate-200/70 bg-white/70 dark:border-slate-700 dark:bg-slate-900/70" />
        <div className="h-72 animate-pulse rounded-3xl border border-slate-200/70 bg-white/70 dark:border-slate-700 dark:bg-slate-900/70" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface-card">
        <p className="text-base font-semibold text-red-600 dark:text-red-300">Unable to load insights</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error}</p>
      </div>
    );
  }

  const categoryMax = byCategory[0]?.total || 1;
  const monthMax = byMonth.reduce((max, item) => Math.max(max, item.total), 1);

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 sm:grid-cols-2">
        <article className="surface-card">
          <p className="stat-card__label">Total tracked</p>
          <p className="stat-card__value text-brand-700 dark:text-brand-300">{formatAmount(totalSpend)}</p>
        </article>
        <article className="surface-card">
          <p className="stat-card__label">Average per month</p>
          <p className="stat-card__value text-ocean-700 dark:text-ocean-300">
            {formatAmount(averageMonthly)}
          </p>
        </article>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
      <section className="surface-card">
        <h2 className="font-display text-xl font-semibold">Category report</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          See which categories drive most spending.
        </p>

        <div className="mt-5 space-y-4">
          {byCategory.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-300">No category data yet.</p>
          ) : (
            byCategory.map((item) => {
              const width = Math.max((item.total / categoryMax) * 100, 6);
              return (
                <div key={item.name}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {formatAmount(item.total)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-700">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${width}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                      className="h-2 rounded-full bg-gradient-to-r from-brand-500 via-brand-400 to-ocean-500"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="surface-card">
        <h2 className="font-display text-xl font-semibold">Monthly report</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Month-by-month trends to guide budget planning.
        </p>

        <div className="mt-5 space-y-4">
          {byMonth.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-300">No monthly data yet.</p>
          ) : (
            byMonth.map((item) => {
              const width = Math.max((item.total / monthMax) * 100, 6);
              return (
                <div key={item.name}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{formatMonth(item.name)}</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {formatAmount(item.total)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-700">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${width}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                      className="h-2 rounded-full bg-gradient-to-r from-ocean-500 to-brand-500"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
      </div>
    </div>
  );
}

export default InsightsPage;
