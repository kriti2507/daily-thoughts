"use client";

import { useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { PenLine } from "lucide-react";

import { createMessageAction } from "@/app/actions";

// Lives in the header and opens a modal so the page itself stays free for
// whatever comes next (chat, analysis) instead of reserving space for a form.
export function ComposeDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const canSave = text.trim().length > 0 && !isPending;

  function open() {
    dialogRef.current?.showModal();
    textareaRef.current?.focus();
  }

  function close() {
    dialogRef.current?.close();
  }

  function save() {
    if (!canSave) {
      return;
    }
    startTransition(async () => {
      try {
        await createMessageAction(text);
        setText("");
        close();
      } catch (error) {
        // Keep the draft: nothing typed should be lost to a failed save.
        console.error("failed to save entry", error);
        window.alert("Couldn't save the entry.");
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
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-[10px] bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-terracotta)] px-3 text-[13px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all duration-200 hover:shadow-[var(--shadow-md)]"
      >
        <PenLine className="h-4 w-4" strokeWidth={2} />
        <span className="hidden sm:inline">New entry</span>
        <span className="sr-only sm:hidden">New entry</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="compose-title"
        className="m-auto w-[min(560px,calc(100%-2rem))] rounded-xl border border-[var(--border)] bg-card p-5 text-foreground shadow-[var(--shadow-md)] backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <h2 id="compose-title" className="font-heading text-lg font-bold">New entry</h2>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={6}
            placeholder="What's on your mind?"
            aria-labelledby="compose-title"
            readOnly={isPending}
            maxLength={4096}
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-[var(--border-strong)]"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[12px] text-[var(--text-muted)]">
              ⌘/Ctrl + Enter to save
            </span>
            <button
              type="button"
              onClick={close}
              className="h-8 cursor-pointer rounded-md px-3 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--border)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="h-8 cursor-pointer rounded-md bg-foreground px-3 text-[13px] font-semibold text-[var(--background)] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
