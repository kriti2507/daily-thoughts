"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteMessageAction } from "@/app/actions";

export function DeleteMessageButton({ id }: { id: number }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Delete this message? This can't be undone.")) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteMessageAction(id);
      } catch (error) {
        console.error("failed to delete message", error);
        window.alert("Couldn't delete the message.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] transition-colors duration-200 hover:bg-[var(--border)] hover:text-foreground disabled:cursor-wait disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
      <span className="sr-only">Delete message</span>
    </button>
  );
}
