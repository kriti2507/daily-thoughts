"use client";

import { useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { Archive, ArrowDown, ArrowUp } from "lucide-react";

import {
  addQuestionAction,
  moveQuestionAction,
  retireQuestionAction,
  updateQuestionAction,
} from "@/app/checkin-actions";

const INPUT =
  "min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[15px] outline-none focus:border-[var(--border-strong)]";
const PRIMARY_BUTTON =
  "h-8 cursor-pointer rounded-md bg-foreground px-3 text-[13px] font-semibold text-[var(--background)] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40";

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] transition-colors duration-200 hover:bg-[var(--border)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function useAction() {
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<void>, failure: string, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        await action();
        onSuccess?.();
      } catch (error) {
        console.error(failure, error);
        window.alert(failure);
      }
    });
  }
  return { isPending, run };
}

export function QuestionEditor({
  id,
  text,
  isFirst,
  isLast,
}: {
  id: number;
  text: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [draft, setDraft] = useState(text);
  const { isPending, run } = useAction();
  const trimmed = draft.trim();
  const isDirty = trimmed !== text;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDirty && trimmed.length > 0 && !isPending) {
      run(() => updateQuestionAction(id, draft), "Couldn't save the question.");
    }
  }

  function retire() {
    if (!window.confirm("Retire this question? Past answers keep it, but it won't be asked again.")) {
      return;
    }
    run(() => retireQuestionAction(id), "Couldn't retire the question.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-card px-3 py-2"
    >
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Question"
        maxLength={500}
        readOnly={isPending}
        className={INPUT}
      />
      {isDirty && (
        <button type="submit" disabled={isPending || trimmed.length === 0} className={PRIMARY_BUTTON}>
          Save
        </button>
      )}
      <IconButton
        label="Move up"
        disabled={isFirst || isPending}
        onClick={() => run(() => moveQuestionAction(id, "up"), "Couldn't move the question.")}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        label="Move down"
        disabled={isLast || isPending}
        onClick={() => run(() => moveQuestionAction(id, "down"), "Couldn't move the question.")}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton label="Retire question" disabled={isPending} onClick={retire}>
        <Archive className="h-3.5 w-3.5" />
      </IconButton>
    </form>
  );
}

export function AddQuestionForm() {
  const [draft, setDraft] = useState("");
  const { isPending, run } = useAction();
  const canAdd = draft.trim().length > 0 && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canAdd) {
      run(() => addQuestionAction(draft), "Couldn't add the question.", () => setDraft(""));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Add a question"
        aria-label="New question"
        maxLength={500}
        readOnly={isPending}
        className={INPUT}
      />
      <button type="submit" disabled={!canAdd} className={PRIMARY_BUTTON}>
        {isPending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
