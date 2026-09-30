import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatDayHeading, formatMonthLabel, monthGrid, shiftMonth } from "@/lib/days";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const NAV_LINK =
  "flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--border)] hover:text-foreground";

// Links rather than client state: each day is its own URL, so the back button
// and bookmarks work. prefetch is off because every link is a dynamic page
// that hits the database.
export function MonthCalendar({
  selectedDay,
  today,
  markedDays,
}: {
  selectedDay: string;
  today: string;
  markedDays: string[];
}) {
  const marked = new Set(markedDays);

  return (
    <nav
      aria-label="Calendar"
      className="rounded-xl border border-[var(--border)] bg-card px-5 py-4"
    >
      <div className="flex items-center justify-between">
        <Link href={`/?day=${shiftMonth(selectedDay, -1)}`} prefetch={false} className={NAV_LINK}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous month</span>
        </Link>
        <p className="font-heading text-[15px] font-bold">{formatMonthLabel(selectedDay)}</p>
        <Link href={`/?day=${shiftMonth(selectedDay, 1)}`} prefetch={false} className={NAV_LINK}>
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next month</span>
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            aria-hidden
            className="text-[11px] font-medium text-[var(--text-muted)]"
          >
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
                aria-current={day === selectedDay ? "page" : undefined}
                aria-label={`${formatDayHeading(day)}${day === today ? ", today" : ""}${marked.has(day) ? ", has entries" : ""}`}
                className={cn(
                  "flex h-9 flex-col items-center justify-center rounded-md text-[13px] transition-colors duration-200 hover:bg-[var(--border)]",
                  day === today &&
                    "font-bold text-[var(--accent-terracotta)] underline underline-offset-4",
                  day === selectedDay &&
                    "bg-foreground text-[var(--background)] hover:bg-foreground",
                )}
              >
                {Number(day.slice(8))}
                <span
                  aria-hidden
                  className={cn(
                    "h-1 w-1 rounded-full",
                    // Amber fails contrast against the selected cell's own
                    // background in dark mode, so swap to the background
                    // colour there to keep the dot visible.
                    day === selectedDay && marked.has(day)
                      ? "bg-[var(--background)]"
                      : "bg-[var(--accent-amber)]",
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
