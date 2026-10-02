"use client";

import { useState, useTransition } from "react";

import { classifyNowAction } from "@/app/category-actions";

const BUTTON =
  "pop h-8 cursor-pointer rounded-md bg-[var(--brand)] px-3 text-[13px] font-semibold text-[var(--surface)] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40";

function waitingText(pending: number): string {
  if (pending === 0) {
    return "Every entry is classified.";
  }
  return pending === 1 ? "1 entry is waiting to be classified." : `${pending} entries are waiting to be classified.`;
}

// For the backlog: old entries, and everything after a category is added or
// reworded. Each click handles one batch.
export function ClassifyNow({ initialPending }: { initialPending: number }) {
  const [pending, setPending] = useState(initialPending);
  const [isRunning, startTransition] = useTransition();

  function classify() {
    startTransition(async () => {
      try {
        setPending((await classifyNowAction()).pending);
      } catch (error) {
        console.error("failed to classify", error);
        window.alert("Couldn't classify entries.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 text-[15px] text-[var(--ink-soft)]">
      <p aria-live="polite">{isRunning ? "Classifying…" : waitingText(pending)}</p>
      {pending > 0 && (
        <button type="button" onClick={classify} disabled={isRunning} className={BUTTON}>
          Classify now
        </button>
      )}
    </div>
  );
}
