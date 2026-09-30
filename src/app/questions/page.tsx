import Link from "next/link";
import { notFound } from "next/navigation";

import { AddQuestionForm, QuestionEditor } from "@/components/question-editor";
import { isAdmin } from "@/lib/admin";
import { listAllQuestions } from "@/lib/checkins";
import type { Question } from "@/lib/checkins";

export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  // A 404 rather than a login prompt: to visitors this page doesn't exist.
  if (!(await isAdmin())) {
    notFound();
  }

  let questions: Question[] | null = null;
  try {
    questions = await listAllQuestions();
  } catch (error) {
    console.error("failed to load questions", error);
  }

  if (questions === null) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <p className="text-[15px] text-[var(--text-secondary)]">
          Couldn&apos;t reach the database. Check <code>DATABASE_URL</code>.
        </p>
      </div>
    );
  }

  const active = questions.filter((q) => q.retiredAt === null);
  const retired = questions.filter((q) => q.retiredAt !== null);

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-[13px] text-[var(--text-secondary)] hover:text-foreground">
          ← Back to today
        </Link>
        <h1 className="font-heading text-2xl font-bold">Questions</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">
          Your daily check-in asks these, in this order. Rewording a question only
          changes future check-ins. Past answers keep the wording they were given.
        </p>
      </div>

      {active.length === 0 ? (
        <p className="text-[15px] text-[var(--text-secondary)]">
          No active questions. Add one below.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {active.map((q, index) => (
            <li key={q.id}>
              <QuestionEditor
                id={q.id}
                text={q.text}
                number={index + 1}
                isFirst={index === 0}
                isLast={index === active.length - 1}
              />
            </li>
          ))}
        </ol>
      )}

      <AddQuestionForm />

      {retired.length > 0 && (
        <details className="text-[15px] text-[var(--text-secondary)]">
          <summary className="cursor-pointer">Retired ({retired.length})</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {retired.map((q) => (
              <li key={q.id}>{q.text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
