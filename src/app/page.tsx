import type { ReactNode } from "react";

import { CheckinAnswers } from "@/components/checkin-answers";
import { CheckinForm } from "@/components/checkin-form";
import { MessageList } from "@/components/message-list";
import { MonthCalendar } from "@/components/month-calendar";
import { isAdmin } from "@/lib/admin";
import { listActiveQuestions, listAnswersForDay, listDaysWithAnswers } from "@/lib/checkins";
import type { Answer, Question } from "@/lib/checkins";
import { formatDayHeading, monthRange, parseDay, today } from "@/lib/days";
import { listDaysWithMessages, listMessagesForDay } from "@/lib/messages";

export const dynamic = "force-dynamic";

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="text-[15px] text-[var(--text-secondary)]">{children}</p>
  );
}

function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
    >
      {children}
    </h2>
  );
}

// Check-ins are private: visitors get neither the answers nor the dots that
// would reveal which days had one.
async function loadDay(day: string, isOwner: boolean) {
  const { first, last } = monthRange(day);
  const [messages, messageDays, answerDays, answers, questions] = await Promise.all([
    listMessagesForDay(day),
    listDaysWithMessages(first, last),
    isOwner ? listDaysWithAnswers(first, last) : ([] as string[]),
    isOwner ? listAnswersForDay(day) : ([] as Answer[]),
    isOwner ? listActiveQuestions() : ([] as Question[]),
  ]);
  return { messages, markedDays: [...messageDays, ...answerDays], answers, questions };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const todayDay = today();
  // A missing or malformed ?day= just means today.
  const day = parseDay((await searchParams).day) ?? todayDay;
  const isOwner = await isAdmin();

  let data: Awaited<ReturnType<typeof loadDay>> | null = null;
  try {
    data = await loadDay(day, isOwner);
  } catch (error) {
    console.error("failed to load day", error);
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8 px-6 py-10">
      {data === null ? (
        <Notice>
          Couldn&apos;t reach the database. Check <code>DATABASE_URL</code>.
        </Notice>
      ) : (
        <>
          <MonthCalendar selectedDay={day} today={todayDay} markedDays={data.markedDays} />

          <section aria-labelledby="day-heading" className="flex flex-col gap-6">
            <h1 id="day-heading" className="font-heading text-2xl font-bold">
              {formatDayHeading(day)}
            </h1>

            {isOwner && (
              <div className="flex flex-col gap-3">
                <SectionTitle id="checkin-heading">Check-in</SectionTitle>
                {day === todayDay ? (
                  <CheckinForm
                    key={day}
                    day={day}
                    questions={data.questions.map(({ id, text }) => ({ id, text }))}
                    initialAnswers={Object.fromEntries(
                      data.answers.map((answer) => [answer.questionId, answer.text]),
                    )}
                  />
                ) : (
                  <CheckinAnswers answers={data.answers} />
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <SectionTitle>Thoughts</SectionTitle>
              {data.messages.length === 0 ? (
                <Notice>No thoughts this day.</Notice>
              ) : (
                <MessageList messages={data.messages} canDelete={isOwner} />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
