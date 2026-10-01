import type { ReactNode } from "react";

import { Board } from "@/components/board";
import type { BoardNote } from "@/components/board";
import { DayNavigation } from "@/components/day-navigation";
import { DayStickerPicker } from "@/components/day-sticker-picker";
import { Sky } from "@/components/sky";
import { TearOffCalendar } from "@/components/tear-off-calendar";
import { TimelineDock } from "@/components/timeline-dock";
import { isAdmin } from "@/lib/admin";
import { listActiveQuestions, listAnswersForDay, listDaysWithAnswers } from "@/lib/checkins";
import type { Answer, Question } from "@/lib/checkins";
import { formatDayHeading, monthRange, parseDay, today } from "@/lib/days";
import { listDaysWithMessages, listMessagesForDay } from "@/lib/messages";
import { listDayStickers } from "@/lib/stickers";
import { mindWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

function Notice({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-[var(--ink-soft)]">{children}</p>;
}

// Check-ins are private: visitors get neither the answers nor anything that
// would reveal which days had one (dots, stamps, stickers).
async function loadDay(day: string, isOwner: boolean) {
  const { first, last } = monthRange(day);
  const [messages, messageDays, answerDays, answers, questions, stickers] = await Promise.all([
    listMessagesForDay(day),
    listDaysWithMessages(first, last),
    isOwner ? listDaysWithAnswers(first, last) : ([] as string[]),
    isOwner ? listAnswersForDay(day) : ([] as Answer[]),
    isOwner ? listActiveQuestions() : ([] as Question[]),
    isOwner ? listDayStickers(first, last) : ({} as Record<string, string>),
  ]);
  return { messages, messageDays, answerDays, answers, questions, stickers };
}

function savedPosition(answer: Answer | undefined) {
  return answer && answer.boardX !== null && answer.boardY !== null
    ? { x: answer.boardX, y: answer.boardY }
    : null;
}

// Today's notes are the active questions; a past day's are the answers it got,
// worded as they were then.
function boardNotes(isToday: boolean, questions: Question[], answers: Answer[]): BoardNote[] {
  if (!isToday) {
    return answers.map((answer) => ({
      id: answer.questionId,
      label: answer.questionText,
      text: answer.text,
      position: savedPosition(answer),
    }));
  }
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  return questions.map((question) => {
    const answer = byQuestion.get(question.id);
    return {
      id: question.id,
      label: question.text,
      text: answer?.text ?? "",
      position: savedPosition(answer),
    };
  });
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

      <Sky messages={data.messages} canDelete={isOwner} weather={weather} />

      {isOwner && (
        <section aria-labelledby="checkin-heading" className="flex flex-col gap-6">
          <h2
            id="checkin-heading"
            className="font-heading text-lg uppercase tracking-wide text-[var(--ink-soft)]"
          >
            Check-in
          </h2>
          <Board
            key={day}
            day={day}
            editable={isToday}
            notes={boardNotes(isToday, data.questions, data.answers)}
          />
          {isToday && <DayStickerPicker key={day} day={day} initial={sticker} />}
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
