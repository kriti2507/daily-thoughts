"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent } from "react";

import { moveNoteAction, saveCheckinAction } from "@/app/checkin-actions";
import { PostIt } from "@/components/post-it";
import type { NotePosition } from "@/components/post-it";
import { boardRows, clamp01, defaultNotePosition, noteColor } from "@/lib/board";
import { cloudJitter } from "@/lib/clouds";
import { CHECKIN_SAVED, emit } from "@/lib/ui-events";

export interface BoardNote {
  id: number; // question id
  label: string;
  text: string;
  position: NotePosition | null;
}

type Status = "idle" | "saved" | "day-ended" | "questions-changed" | "error";

// idle is deliberately empty: the live region below only ever announces a
// save result, never the static hint.
const STATUS_TEXT: Record<Status, string> = {
  idle: "",
  saved: "Stuck!",
  // The drafts survive only until the next revalidation remounts this board
  // under the new day's key (e.g. the midnight rollover) — an accepted
  // limitation, since there's nowhere else to keep them once that happens.
  "day-ended": "This day has ended. Your drafts are still here. Copy them, then refresh.",
  "questions-changed": "Your questions changed. The board is updated; review and save again.",
  error: "Couldn't save the check-in.",
};

const DESKTOP = "(min-width: 48rem)";
const NUDGE = 0.05;
const NUDGES: Record<string, [number, number]> = {
  ArrowLeft: [-NUDGE, 0],
  ArrowRight: [NUDGE, 0],
  ArrowUp: [0, -NUDGE],
  ArrowDown: [0, NUDGE],
};
const SLAP_STAGGER_S = 0.06;
const ROW_REM = 14; // a 12rem note plus room to breathe

// The check-in as post-its. Today's notes are written on and saved together;
// any day's notes can be dragged around on desktop by their tape.
export function Board({
  day,
  editable,
  notes,
}: {
  day: string;
  editable: boolean;
  notes: BoardNote[];
}) {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(notes.map((note) => [note.id, note.text])),
  );
  const [positions, setPositions] = useState<Record<number, NotePosition>>(() =>
    Object.fromEntries(
      notes.flatMap((note) => (note.position ? [[note.id, note.position] as const] : [])),
    ),
  );
  // Notes whose answer exists in the database, so their position can be saved.
  const [saved, setSaved] = useState<Set<number>>(
    () => new Set(notes.filter((note) => note.text.trim().length > 0).map((note) => note.id)),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [slapRound, setSlapRound] = useState(0);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    origin: NotePosition;
    latest: NotePosition | null;
  } | null>(null);
  const nudged = useRef<{ id: number; position: NotePosition } | null>(null);
  // Moved before their answer was saved; persisted once it is.
  const movedUnsaved = useRef(new Set<number>());
  const [isPending, startTransition] = useTransition();

  function positionOf(id: number, index: number): NotePosition {
    return positions[id] ?? defaultNotePosition(index, notes.length);
  }

  function persist(id: number, position: NotePosition) {
    if (!saved.has(id)) {
      movedUnsaved.current.add(id);
      return;
    }
    moveNoteAction(day, id, position.x, position.y).catch((error) => {
      console.error("failed to move note", error);
    });
  }

  function place(id: number, position: NotePosition) {
    setPositions((current) => ({ ...current, [id]: position }));
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, id: number, origin: NotePosition) {
    if (!window.matchMedia(DESKTOP).matches) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, startX: event.clientX, startY: event.clientY, origin, latest: null };
    setDraggingId(id);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    const board = boardRef.current;
    const note = event.currentTarget.parentElement;
    if (!current || !board || !note) {
      return;
    }
    const rect = board.getBoundingClientRect();
    const spanX = rect.width - note.offsetWidth;
    const spanY = rect.height - note.offsetHeight;
    const next = {
      x: clamp01(current.origin.x + (spanX > 0 ? (event.clientX - current.startX) / spanX : 0)),
      y: clamp01(current.origin.y + (spanY > 0 ? (event.clientY - current.startY) / spanY : 0)),
    };
    current.latest = next;
    place(current.id, next);
  }

  function handlePointerUp() {
    const current = drag.current;
    drag.current = null;
    setDraggingId(null);
    if (current?.latest) {
      persist(current.id, current.latest);
    }
  }

  function handleTapeKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: number, origin: NotePosition) {
    const step = NUDGES[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const next = { x: clamp01(origin.x + step[0]), y: clamp01(origin.y + step[1]) };
    nudged.current = { id, position: next };
    place(id, next);
  }

  function handleTapeBlur(id: number) {
    if (nudged.current?.id === id) {
      persist(id, nudged.current.position);
      nudged.current = null;
    }
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
    // saving twice in a row still announces the second time.
    setStatus("idle");
    startTransition(async () => {
      try {
        const result = await saveCheckinAction(
          day,
          notes.map((note) => ({ questionId: note.id, text: drafts[note.id] ?? "" })),
        );
        if (result.ok) {
          const filled = notes
            .filter((note) => (drafts[note.id] ?? "").trim().length > 0)
            .map((note) => note.id);
          setSaved(new Set(filled));
          setStatus("saved");
          setSlapRound((round) => round + 1);
          emit(CHECKIN_SAVED, { day, filled: filled.length > 0 });
          // Notes dragged before they existed keep where they were put.
          for (const id of filled) {
            const position = positions[id];
            if (movedUnsaved.current.has(id) && position) {
              moveNoteAction(day, id, position.x, position.y).catch((error) => {
                console.error("failed to move note", error);
              });
            }
          }
          movedUnsaved.current.clear();
        } else if (result.reason === "questions-changed") {
          setStatus("questions-changed");
          // Component state survives a router refresh — only the day changing
          // remounts this board under a new key — so this picks up the current
          // questions without losing what's typed.
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

  function handleTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  }

  if (notes.length === 0) {
    return editable ? (
      <p className="w-fit rounded-md border-2 border-dashed border-[var(--ink-soft)] px-5 py-4 text-[15px]">
        No questions yet.{" "}
        <Link href="/questions" className="font-semibold underline underline-offset-2">
          Add some
        </Link>
        .
      </p>
    ) : (
      <p className="text-[15px] text-[var(--ink-soft)]">No check-in this day.</p>
    );
  }

  const board = (
    <div
      ref={boardRef}
      className="board"
      style={{ "--board-h": `${boardRows(notes.length) * ROW_REM}rem` } as CSSProperties}
    >
      {notes.map((note, index) => {
        const position = positionOf(note.id, index);
        const isSlapping = slapRound > 0 && (drafts[note.id] ?? "").trim().length > 0;
        return (
          <PostIt
            // A new key per save round restarts the slap animation.
            key={isSlapping ? `${note.id}-${slapRound}` : note.id}
            label={note.label}
            labelFor={editable ? `note-${note.id}` : undefined}
            color={noteColor(index)}
            tilt={cloudJitter(note.id).tilt}
            position={position}
            isSlapping={isSlapping}
            slapDelay={index * SLAP_STAGGER_S}
            isDragging={draggingId === note.id}
            handle={
              <button
                type="button"
                data-keys-local
                aria-label={`Move note: ${note.label}`}
                className="note-tape"
                onPointerDown={(event) => handlePointerDown(event, note.id, position)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={(event) => handleTapeKeyDown(event, note.id, position)}
                onBlur={() => handleTapeBlur(note.id)}
              />
            }
          >
            {editable ? (
              <textarea
                id={`note-${note.id}`}
                value={drafts[note.id] ?? ""}
                onChange={(event) => update(note.id, event.target.value)}
                onKeyDown={handleTextKeyDown}
                readOnly={isPending}
                maxLength={4096}
                rows={3}
                placeholder="…"
                className="mt-2 min-h-16 w-full flex-1 resize-none overflow-auto bg-transparent font-accent text-[22px] leading-tight outline-none field-sizing-content placeholder:text-[var(--ink)] placeholder:opacity-50 md:field-sizing-fixed"
              />
            ) : (
              <p className="mt-2 flex-1 overflow-auto whitespace-pre-wrap break-words font-accent text-[22px] leading-tight">
                {note.text}
              </p>
            )}
          </PostIt>
        );
      })}
    </div>
  );

  if (!editable) {
    return board;
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="checkin-heading" className="flex flex-col gap-5">
      {board}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--ink-soft)]">
          <span>⌘/Ctrl + Enter to stick</span>
          <span role="status">{STATUS_TEXT[status]}</span>
        </span>
        <button
          type="submit"
          disabled={isPending}
          className="pop h-10 cursor-pointer rounded-xl bg-[var(--brand)] px-4 font-heading text-[15px] text-[var(--surface)] transition-transform duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Sticking…" : "Stick it"}
        </button>
      </div>
    </form>
  );
}
