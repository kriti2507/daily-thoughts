"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { saveCheckinAction } from "@/app/checkin-actions";

type Status = "idle" | "saved" | "day-ended" | "questions-changed" | "error";

// idle is deliberately empty: the live region below only ever announces a
// save result, never the static hint.
const STATUS_TEXT: Record<Status, string> = {
  idle: "",
  saved: "Saved",
  // The drafts survive only until the next revalidation remounts this form
  // under the new day's key (e.g. the midnight rollover) — an accepted
  // limitation, since there's nowhere else to keep them once that happens.
  "day-ended": "This day has ended. Your drafts are still here. Copy them, then refresh.",
  "questions-changed": "Your questions changed. The form is updated; review and save again.",
  error: "Couldn't save the check-in.",
};

export function CheckinForm({
  day,
  questions,
  initialAnswers,
}: {
  day: string;
  questions: { id: number; text: string }[];
  initialAnswers: Record<number, string>;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, initialAnswers[q.id] ?? ""])),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (questions.length === 0) {
    return (
      <p className="text-[15px] text-[var(--text-secondary)]">
        No questions yet.{" "}
        <Link href="/questions" className="underline underline-offset-2">
          Add some
        </Link>
        .
      </p>
    );
  }

  function update(id: number, value: string) {
    setDrafts((current) => ({ ...current, [id]: value }));
    setStatus("idle");
  }

  function save() {
    if (isPending) {
      return;
    }
    // Cleared up front so the live region always transitions through empty:
    // saving twice in a row still announces "Saved" the second time.
    setStatus("idle");
    startTransition(async () => {
      try {
        const result = await saveCheckinAction(
          day,
          questions.map((q) => ({ questionId: q.id, text: drafts[q.id] ?? "" })),
        );
        if (result.ok) {
          setStatus("saved");
        } else if (result.reason === "questions-changed") {
          setStatus("questions-changed");
          // Component state (drafts, status) survives a router refresh — only
          // the day changing remounts this form under a new key — so this
          // picks up the current question set without losing what's typed.
          router.refresh();
        } else {
          setStatus(result.reason);
        }
      } catch (error) {
        // Keep the drafts: nothing typed should be lost to a failed save.
        console.error("failed to save check-in", error);
        setStatus("error");
      }
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="checkin-heading"
      className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-card px-5 py-4"
    >
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-1.5">
          <label htmlFor={`question-${q.id}`} className="text-[15px] font-medium">
            {q.text}
          </label>
          <textarea
            id={`question-${q.id}`}
            value={drafts[q.id] ?? ""}
            onChange={(event) => update(q.id, event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            readOnly={isPending}
            maxLength={4096}
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-[var(--border-strong)]"
          />
        </div>
      ))}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--text-muted)]">
          <span>⌘/Ctrl + Enter to save</span>
          <span role="status">{STATUS_TEXT[status]}</span>
        </span>
        <button
          type="submit"
          disabled={isPending}
          className="h-8 cursor-pointer rounded-md bg-foreground px-3 text-[13px] font-semibold text-[var(--background)] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
