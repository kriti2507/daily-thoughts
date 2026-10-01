"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { MonthCalendar } from "@/components/month-calendar";

// The full month in a modal, shared by the tear-off calendar and the dock.
export function MonthPopover({
  open,
  onClose,
  selectedDay,
  today,
  markedDays,
}: {
  open: boolean;
  onClose: () => void;
  selectedDay: string;
  today: string;
  markedDays: string[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Pick a day"
      onClose={onClose}
      // A click on the backdrop lands on the dialog itself.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="pop-lg m-auto w-[min(360px,calc(100%-2rem))] rounded-2xl bg-[var(--surface)] p-4 text-[var(--ink)] backdrop:bg-black/40"
    >
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--note-1)]"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <MonthCalendar
        selectedDay={selectedDay}
        today={today}
        markedDays={markedDays}
        onNavigate={onClose}
      />
    </dialog>
  );
}
