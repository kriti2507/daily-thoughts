"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const subscribe = () => () => {};

// The saved mode is only known in the browser, so the server render (and the
// first client render) draw the default, loud.
export function ModeSwitch() {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const isLoud = !hydrated || theme !== "calm";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLoud}
      aria-label="Loud mode"
      onClick={() => setTheme(isLoud ? "calm" : "loud")}
      className="pop flex h-10 cursor-pointer items-center rounded-full p-1 text-[12px] font-bold uppercase tracking-wide"
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors duration-200",
          !isLoud && "bg-[var(--ink)] text-[var(--paper)]",
        )}
      >
        calm
      </span>
      <span
        aria-hidden
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors duration-200",
          isLoud && "bg-[var(--ink)] text-[var(--note-1)]",
        )}
      >
        loud
      </span>
    </button>
  );
}
