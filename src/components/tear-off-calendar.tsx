"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { MonthPopover } from "@/components/month-popover";
import { dayParts, shiftDay } from "@/lib/days";
import { afterAnimation, CHECKIN_SAVED, FLIP_DAY } from "@/lib/ui-events";
import { cn } from "@/lib/utils";

const TEAR_MS = 300;

const NAV_BUTTON =
  "pop flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-transform duration-150 hover:-translate-y-0.5";

// The one place that moves between days with the tear animation. It's mounted
// on every screen size (hidden on phones) so the keyboard and swipe handlers
// can ask it to flip through FLIP_DAY.
export function TearOffCalendar({
  day,
  today,
  sticker,
  checkedIn,
  markedDays,
}: {
  day: string;
  today: string;
  sticker: string | null;
  checkedIn: boolean;
  markedDays: string[];
}) {
  const router = useRouter();
  const [tearingDay, setTearingDay] = useState<string | null>(null);
  // The day a save just stamped (plays the thunk), or null after a save that
  // left the check-in empty.
  const [stamped, setStamped] = useState<{ day: string; filled: boolean } | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const { month, date, weekday } = dayParts(day);
  const isTearing = tearingDay === day;
  const justStamped = stamped?.day === day && stamped.filled;
  const showStamp = stamped?.day === day ? stamped.filled : checkedIn;

  async function flip(delta: number) {
    if (isTearing) {
      return;
    }
    setTearingDay(day);
    await afterAnimation(TEAR_MS);
    router.push(`/?day=${shiftDay(day, delta)}`);
  }

  const onFlip = useEffectEvent((delta: number) => {
    void flip(delta);
  });
  const onSaved = useEffectEvent((filled: boolean) => {
    setStamped({ day, filled });
  });

  useEffect(() => {
    function handleFlip(event: Event) {
      onFlip((event as CustomEvent<{ delta: number }>).detail.delta);
    }
    function handleSaved(event: Event) {
      onSaved((event as CustomEvent<{ filled: boolean }>).detail.filled);
    }
    window.addEventListener(FLIP_DAY, handleFlip);
    window.addEventListener(CHECKIN_SAVED, handleSaved);
    return () => {
      window.removeEventListener(FLIP_DAY, handleFlip);
      window.removeEventListener(CHECKIN_SAVED, handleSaved);
    };
  }, []);

  return (
    <div className="w-36 rotate-3 select-none">
      <p className="rounded-t-lg border-[length:var(--line)] border-b-0 border-[var(--ink)] bg-[var(--brand)] py-1 text-center font-heading text-sm uppercase tracking-widest text-[var(--surface)]">
        {month}
      </p>
      <div
        key={day}
        className={cn(
          "tear-page pop-lg relative rounded-b-lg bg-[var(--surface)] px-2 pb-3 pt-2 text-center",
          isTearing ? "is-tearing" : "is-settling",
        )}
      >
        <p className="font-heading text-6xl leading-none">{date}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wider">{weekday}</p>
        {day === today && (
          <p className="text-[10px] font-semibold uppercase text-[var(--brand)]">today</p>
        )}
        {sticker && (
          <span role="img" aria-label="Day sticker" className="absolute -right-3 -top-3 text-3xl">
            {sticker}
          </span>
        )}
        {showStamp && <span className={cn("stamp", justStamped && "is-thunking")}>Checked in</span>}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => flip(-1)} className={NAV_BUTTON}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous day</span>
        </button>
        <button type="button" onClick={() => setMonthOpen(true)} className={NAV_BUTTON}>
          <CalendarDays className="h-4 w-4" />
          <span className="sr-only">Pick a day</span>
        </button>
        <button type="button" onClick={() => flip(1)} className={NAV_BUTTON}>
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next day</span>
        </button>
      </div>
      <MonthPopover
        open={monthOpen}
        onClose={() => setMonthOpen(false)}
        selectedDay={day}
        today={today}
        markedDays={markedDays}
      />
    </div>
  );
}
