"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MonthPopover } from "@/components/month-popover";
import { dayParts, formatDayHeading, monthGrid, shiftMonth } from "@/lib/days";
import { cn } from "@/lib/utils";

const DOCK_BUTTON = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";

// Phones only: one dot per day of the month in a scroller. A dot is the
// day's sticker if it has one, pink for a check-in, yellow for thoughts.
export function TimelineDock({
  day,
  today,
  messageDays,
  checkinDays,
  stickers,
}: {
  day: string;
  today: string;
  messageDays: string[];
  checkinDays: string[];
  stickers: Record<string, string>;
}) {
  const selectedRef = useRef<HTMLAnchorElement>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const days = monthGrid(day)
    .flat()
    .filter((cell): cell is string => cell !== null);
  const withThoughts = new Set(messageDays);
  const withCheckin = new Set(checkinDays);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [day]);

  return (
    <nav
      aria-label="Days"
      className="fixed inset-x-3 bottom-3 z-30 flex items-center gap-1 rounded-full bg-[var(--ink)] px-2 py-2 text-[var(--paper)] shadow-[var(--shadow)] md:hidden"
    >
      <Link href={`/?day=${shiftMonth(day, -1)}`} prefetch={false} className={DOCK_BUTTON}>
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Previous month</span>
      </Link>
      <button
        type="button"
        onClick={() => setMonthOpen(true)}
        className="shrink-0 cursor-pointer px-1 font-heading text-xs uppercase tracking-wider text-[var(--note-1)]"
      >
        {dayParts(day).month.slice(0, 3)}
        <span className="sr-only">, pick a day</span>
      </button>
      <ol className="flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {days.map((cell) => {
          const selected = cell === day;
          const sticker = stickers[cell];
          const hasEntries = withThoughts.has(cell) || withCheckin.has(cell);
          return (
            <li key={cell} className="shrink-0">
              <Link
                ref={selected ? selectedRef : undefined}
                href={`/?day=${cell}`}
                prefetch={false}
                aria-current={selected ? "page" : undefined}
                aria-label={`${formatDayHeading(cell)}${cell === today ? ", today" : ""}${hasEntries ? ", has entries" : ""}`}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  selected && "bg-[var(--paper)] ring-2 ring-[var(--brand)]",
                )}
              >
                {sticker ? (
                  <span aria-hidden className="text-base leading-none">
                    {sticker}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "rounded-full",
                      selected ? "h-3 w-3" : "h-2 w-2",
                      withCheckin.has(cell)
                        ? "bg-[var(--note-2)]"
                        : withThoughts.has(cell)
                          ? "bg-[var(--note-1)]"
                          : selected
                            ? "bg-[var(--ink)]"
                            : "bg-[var(--paper)] opacity-30",
                      cell === today &&
                        !selected &&
                        "ring-2 ring-[var(--note-1)] ring-offset-1 ring-offset-[var(--ink)]",
                    )}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
      <Link href={`/?day=${shiftMonth(day, 1)}`} prefetch={false} className={DOCK_BUTTON}>
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Next month</span>
      </Link>
      <MonthPopover
        open={monthOpen}
        onClose={() => setMonthOpen(false)}
        selectedDay={day}
        today={today}
        markedDays={[...messageDays, ...checkinDays]}
      />
    </nav>
  );
}
