import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatDayHeading, formatMonthLabel, monthGrid, shiftMonth } from "@/lib/days";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const NAV_LINK =
  "flex h-8 w-8 items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors duration-200 hover:bg-[var(--note-1)] hover:text-[var(--ink)]";

// Links rather than client state: each day is its own URL, so the back button
// and bookmarks work. prefetch is off because every link is a dynamic page
// that hits the database. `onNavigate` fires when a day is picked, so the
// popover can close; the month arrows leave it open for browsing.
export function MonthCalendar({
  selectedDay,
  today,
  markedDays,
  onNavigate,
}: {
  selectedDay: string;
  today: string;
  markedDays: string[];
  onNavigate?: () => void;
}) {
  const marked = new Set(markedDays);

  return (
    <nav aria-label="Calendar">
      <div className="flex items-center justify-between">
        <Link
          href={`/?day=${shiftMonth(selectedDay, -1)}`}
          prefetch={false}
          className={NAV_LINK}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous month</span>
        </Link>
        <p className="font-heading text-[16px]">{formatMonthLabel(selectedDay)}</p>
        <Link
          href={`/?day=${shiftMonth(selectedDay, 1)}`}
          prefetch={false}
          className={NAV_LINK}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next month</span>
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} aria-hidden className="text-[11px] font-semibold text-[var(--ink-soft)]">
            {weekday}
          </span>
        ))}
        {monthGrid(selectedDay)
          .flat()
          .map((day, index) =>
            day === null ? (
              <span key={`empty-${index}`} />
            ) : (
              <Link
                key={day}
                href={`/?day=${day}`}
                prefetch={false}
                onClick={onNavigate}
                aria-current={day === selectedDay ? "page" : undefined}
                aria-label={`${formatDayHeading(day)}${day === today ? ", today" : ""}${marked.has(day) ? ", has entries" : ""}`}
                className={cn(
                  "flex h-9 flex-col items-center justify-center rounded-md text-[13px] transition-colors duration-200 hover:bg-[var(--note-1)]",
                  day === today && "font-bold text-[var(--brand)] underline underline-offset-2",
                  day === selectedDay &&
                    "bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]",
                )}
              >
                {Number(day.slice(8))}
                <span
                  aria-hidden
                  className={cn(
                    "h-1 w-1 rounded-full",
                    day === selectedDay ? "bg-[var(--paper)]" : "bg-[var(--brand)]",
                    !marked.has(day) && "invisible",
                  )}
                />
              </Link>
            ),
          )}
      </div>
    </nav>
  );
}
