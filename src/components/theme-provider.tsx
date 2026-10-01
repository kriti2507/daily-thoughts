"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ReactNode } from "react";

// "Theme" here is the calm/loud mode. Calm's night variant comes from the
// system's colour scheme in CSS, so next-themes doesn't track it. A new
// storage key, so a "dark" saved by the old toggle isn't read as a mode.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-mode"
      themes={["loud", "calm"]}
      defaultTheme="loud"
      enableSystem={false}
      storageKey="daily-thoughts-mode"
    >
      {children}
    </NextThemesProvider>
  );
}
