"use client";

import { useTheme } from "@/components/theme-provider";

const LABELS = {
  light: "Light",
  dusk: "Dusk",
  night: "Night",
} as const;

export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycleTheme}
      aria-label={`Switch theme, current ${LABELS[theme]}`}
      title={`Theme: ${LABELS[theme]}`}
    >
      <span>Theme</span>
      <strong>{LABELS[theme]}</strong>
    </button>
  );
}
