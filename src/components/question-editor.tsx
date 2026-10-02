"use client";

import { useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { Archive, ArrowDown, ArrowUp } from "lucide-react";

import {
  addCategoryAction,
  moveCategoryAction,
  retireCategoryAction,
  updateCategoryAction,
} from "@/app/category-actions";
import {
  addQuestionAction,
  moveQuestionAction,
  retireQuestionAction,
  updateQuestionAction,
} from "@/app/checkin-actions";

const INPUT =
  "min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[15px] outline-none focus:border-[var(--border-strong)]";
const PRIMARY_BUTTON =
  "pop h-8 cursor-pointer rounded-md bg-[var(--brand)] px-3 text-[13px] font-semibold text-[var(--surface)] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40";

// Questions and categories are edited the same way; only the words, limits
// and actions differ.
const KINDS = {
  question: {
    noun: "question",
    maxLength: 500,
    retireWarning: "Retire this question? Past answers keep it, but it won't be asked again.",
    add: addQuestionAction,
    update: updateQuestionAction,
    move: moveQuestionAction,
    retire: retireQuestionAction,
  },
  category: {
    noun: "category",
    maxLength: 60,
    retireWarning: "Retire this category? Entries stop showing it, and new ones aren't sorted into it.",
    add: addCategoryAction,
    update: updateCategoryAction,
    move: moveCategoryAction,
    retire: retireCategoryAction,
  },
};

export type EditorKind = keyof typeof KINDS;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

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
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors duration-200 hover:bg-[var(--border)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
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
  kind = "question",
  id,
  text,
  number,
  isFirst,
  isLast,
}: {
  kind?: EditorKind;
  id: number;
  text: string;
  number: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { noun, maxLength, retireWarning, update, move, retire: retireAction } = KINDS[kind];
  const [draft, setDraft] = useState(text);
  const { isPending, run } = useAction();
  const trimmed = draft.trim();
  const isDirty = trimmed !== text;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDirty && trimmed.length > 0 && !isPending) {
      run(() => update(id, draft), `Couldn't save the ${noun}.`);
    }
  }

  function retire() {
    if (!window.confirm(retireWarning)) {
      return;
    }
    run(() => retireAction(id), `Couldn't retire the ${noun}.`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="pop flex items-center gap-1 rounded-xl px-3 py-2"
    >
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={`${capitalize(noun)} ${number}`}
        maxLength={maxLength}
        readOnly={isPending}
        className={INPUT}
      />
      {isDirty && (
        <button type="submit" disabled={isPending || trimmed.length === 0} className={PRIMARY_BUTTON}>
          Save
        </button>
      )}
      <IconButton
        label={`Move ${noun} ${number} up`}
        disabled={isFirst || isPending}
        onClick={() => run(() => move(id, "up"), `Couldn't move the ${noun}.`)}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        label={`Move ${noun} ${number} down`}
        disabled={isLast || isPending}
        onClick={() => run(() => move(id, "down"), `Couldn't move the ${noun}.`)}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton label={`Retire ${noun} ${number}`} disabled={isPending} onClick={retire}>
        <Archive className="h-3.5 w-3.5" />
      </IconButton>
    </form>
  );
}

export function AddQuestionForm({ kind = "question" }: { kind?: EditorKind }) {
  const { noun, maxLength, add } = KINDS[kind];
  const [draft, setDraft] = useState("");
  const { isPending, run } = useAction();
  const canAdd = draft.trim().length > 0 && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canAdd) {
      run(() => add(draft), `Couldn't add the ${noun}.`, () => setDraft(""));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={`Add a ${noun}`}
        aria-label={`New ${noun}`}
        maxLength={maxLength}
        readOnly={isPending}
        className={INPUT}
      />
      <button type="submit" disabled={!canAdd} className={PRIMARY_BUTTON}>
        {isPending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
