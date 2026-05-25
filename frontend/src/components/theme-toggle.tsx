"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="w-9 h-9 rounded-[10px] border border-[var(--border)] bg-[var(--card)] flex items-center justify-center transition-all duration-200 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] cursor-pointer"
      suppressHydrationWarning
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all duration-200 dark:-rotate-90 dark:scale-0 text-[var(--accent-amber)]" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all duration-200 dark:rotate-0 dark:scale-100 text-[var(--accent-amber)]" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
