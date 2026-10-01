"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { PenLine } from "lucide-react";

import { createMessageAction } from "@/app/actions";
import { CloudShape } from "@/components/cloud-shape";
import { afterAnimation, OPEN_COMPOSER } from "@/lib/ui-events";
import { cn } from "@/lib/utils";

const RISE_MS = 600;

// Lives in the header and opens a cloud-shaped modal; on save the cloud floats
// up into the sky. Also opens on the `n` key (via OPEN_COMPOSER).
export function ComposeDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [isRising, setIsRising] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canSave = text.trim().length > 0 && !isPending;
  const busy = isPending || isRising;

  function open() {
    if (busy) return; // the save in flight closes the dialog itself
    dialogRef.current?.showModal();
    textareaRef.current?.focus();
  }

  function close() {
    dialogRef.current?.close();
  }

  const onOpenEvent = useEffectEvent(open);
  useEffect(() => {
    const handle = () => onOpenEvent();
    window.addEventListener(OPEN_COMPOSER, handle);
    return () => window.removeEventListener(OPEN_COMPOSER, handle);
  }, []);

  function save() {
    if (!canSave) {
      return;
    }
    startTransition(async () => {
      try {
        await createMessageAction(text);
        setIsRising(true);
        await afterAnimation(RISE_MS);
        setText("");
        close();
        setIsRising(false);
      } catch (error) {
        // Keep the draft: nothing typed should be lost to a failed save.
        console.error("failed to save entry", error);
        window.alert("Couldn't save the thought.");
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
        className="pop flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[var(--brand)] px-3 text-[13px] font-bold text-[var(--surface)] transition-transform duration-150 hover:-translate-y-0.5"
      >
        <PenLine className="h-4 w-4" strokeWidth={2.5} />
        <span className="hidden sm:inline">New thought</span>
        <span className="sr-only sm:hidden">New thought</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="compose-title"
        // Escape mid-save would let a reopen race the pending close().
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        // The form fills the dialog (p-0), so only backdrop clicks land here.
        onClick={(event) => event.target === event.currentTarget && !busy && close()}
        className="mx-auto mt-[8dvh] mb-auto sm:m-auto w-[min(560px,calc(100%-2rem))] overflow-visible bg-transparent p-0 text-[var(--ink)] backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <form
          onSubmit={handleSubmit}
          className={cn("cloud flex flex-col gap-3 px-10 pb-10 pt-14", isRising && "is-rising")}
        >
          <CloudShape />
          <h2 id="compose-title" className="font-heading text-xl">
            New thought
          </h2>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={5}
            placeholder="What's floating around up there?"
            aria-labelledby="compose-title"
            readOnly={isPending}
            maxLength={4096}
            className="max-h-[40dvh] w-full resize-none rounded-2xl border-[length:var(--line)] border-[var(--ink)] bg-[var(--paper)] px-4 py-3 text-[16px] leading-relaxed outline-none ring-1 ring-[var(--border)] focus:ring-2 focus:ring-[var(--brand)] sm:resize-y"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[12px] text-[var(--ink-soft)]">⌘/Ctrl + Enter to save</span>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="h-9 cursor-pointer rounded-lg px-3 text-[13px] font-semibold text-[var(--ink-soft)] hover:bg-[var(--note-1)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="pop h-9 cursor-pointer rounded-lg bg-[var(--brand)] px-3 text-[13px] font-bold text-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Floating…" : "Let it float"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
