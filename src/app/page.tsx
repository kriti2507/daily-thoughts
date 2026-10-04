import type { ReactNode } from "react";

import { Board } from "@/components/board";
import { DayNavigation } from "@/components/day-navigation";
import { DayStickerPicker } from "@/components/day-sticker-picker";
import { Sky } from "@/components/sky";
import { TearOffCalendar } from "@/components/tear-off-calendar";
import { TimelineDock } from "@/components/timeline-dock";
import { isAdmin } from "@/lib/admin";
import { boardNotes } from "@/lib/board";
import { listActiveQuestions, listAnswersForDay } from "@/lib/checkins";
import type { Answer, Question } from "@/lib/checkins";
import { listTagsForDay } from "@/lib/classifications";
import type { DayTags } from "@/lib/classifications";
import { formatDayHeading, monthRange, parseDay, today } from "@/lib/days";
import { listMessagesForDay } from "@/lib/messages";
import { listMonthMarks } from "@/lib/month-marks";
import { mindWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

function Notice({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-[var(--ink-soft)]">{children}</p>;
}

// Check-ins are private: visitors get neither the answers nor anything that
// would reveal which days had one (dots, stamps, stickers). Categories are
// private too, even on public thoughts.
async function loadDay(day: string, isOwner: boolean) {
  const { first, last } = monthRange(day);
  const [messages, marks, answers, questions, tags] = await Promise.all([
    listMessagesForDay(day),
    listMonthMarks(first, last, isOwner),
    isOwner ? listAnswersForDay(day) : ([] as Answer[]),
    isOwner ? listActiveQuestions() : ([] as Question[]),
    isOwner ? listTagsForDay(day) : ({ messages: {}, answers: {} } as DayTags),
  ]);
  return { messages, ...marks, answers, questions, tags };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const todayDay = today();
  // A missing or malformed ?day= just means today.
  const day = parseDay((await searchParams).day) ?? todayDay;
  const isToday = day === todayDay;
  const isOwner = await isAdmin();

  let data: Awaited<ReturnType<typeof loadDay>> | null = null;
  try {
    data = await loadDay(day, isOwner);
  } catch (error) {
    console.error("failed to load day", error);
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-[960px] px-6 py-10">
        <Notice>
          Couldn&apos;t reach the database. Check <code>DATABASE_URL</code>.
        </Notice>
      </div>
    );
  }

  const weather = mindWeather(data.messages.length);
  const sticker = data.stickers[day] ?? null;

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-8 px-4 pb-28 pt-8 sm:px-6 md:pb-12">
      <DayNavigation canCompose={isOwner} />

      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1 pt-2">
          <h1 id="day-heading" className="font-heading text-3xl sm:text-4xl">
            {formatDayHeading(day)}
          </h1>
          <p className="text-[15px] font-semibold text-[var(--ink-soft)]">
            <span aria-hidden>{weather.icon}</span> {weather.label}
          </p>
        </div>
        {/* Hidden, not unmounted, on phones: it owns the flip animation that
            keys and swipes trigger. */}
        <div className="hidden md:block">
          <TearOffCalendar
            day={day}
            today={todayDay}
            sticker={sticker}
            checkedIn={data.answers.length > 0}
            markedDays={[...data.messageDays, ...data.answerDays]}
          />
        </div>
      </div>

      <Sky messages={data.messages} canDelete={isOwner} weather={weather} tags={data.tags.messages} />

      {isOwner && (
        <section aria-labelledby="checkin-heading" className="flex flex-col gap-6">
          <h2
            id="checkin-heading"
            className="font-heading text-lg uppercase tracking-wide text-[var(--ink-soft)]"
          >
            Check-in
          </h2>
          {/* Distinct keys: siblings sharing one would confuse React's
              reconciliation and can leave a stale board behind. */}
          <Board
            key={`board-${day}`}
            day={day}
            editable={isToday}
            notes={boardNotes(isToday, data.questions, data.answers, data.tags.answers)}
          />
          {isToday && <DayStickerPicker key={`sticker-${day}`} day={day} initial={sticker} />}
        </section>
      )}

      <TimelineDock
        day={day}
        today={todayDay}
        messageDays={data.messageDays}
        checkinDays={data.answerDays}
        stickers={data.stickers}
      />
    </div>
  );
}
