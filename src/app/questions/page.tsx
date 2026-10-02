import Link from "next/link";
import { notFound } from "next/navigation";

import { ClassifyNow } from "@/components/classify-now";
import { AddQuestionForm, QuestionEditor } from "@/components/question-editor";
import type { EditorKind } from "@/components/question-editor";
import { isAdmin } from "@/lib/admin";
import { listAllCategories } from "@/lib/categories";
import { listAllQuestions } from "@/lib/checkins";
import { countPendingEntries } from "@/lib/classifications";
import { isClassifierConfigured } from "@/lib/classify";

export const dynamic = "force-dynamic";

type Item = { id: number; text: string; retiredAt: Date | null };

async function loadPage() {
  const [questions, categories, pending] = await Promise.all([
    listAllQuestions(),
    listAllCategories(),
    countPendingEntries(),
  ]);
  return { questions, categories, pending };
}

// Active items in order with their editors, the add form, then retired ones.
function EditableList({ kind, items, empty }: { kind: EditorKind; items: Item[]; empty: string }) {
  const active = items.filter((item) => item.retiredAt === null);
  const retired = items.filter((item) => item.retiredAt !== null);
  return (
    <>
      {active.length === 0 ? (
        <p className="text-[15px] text-[var(--ink-soft)]">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {active.map((item, index) => (
            <li key={item.id}>
              <QuestionEditor
                kind={kind}
                id={item.id}
                text={item.text}
                number={index + 1}
                isFirst={index === 0}
                isLast={index === active.length - 1}
              />
            </li>
          ))}
        </ol>
      )}

      <AddQuestionForm kind={kind} />

      {retired.length > 0 && (
        <details className="text-[15px] text-[var(--ink-soft)]">
          <summary className="cursor-pointer">Retired ({retired.length})</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {retired.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export default async function QuestionsPage() {
  // A 404 rather than a login prompt: to visitors this page doesn't exist.
  if (!(await isAdmin())) {
    notFound();
  }

  let data: Awaited<ReturnType<typeof loadPage>> | null = null;
  try {
    data = await loadPage();
  } catch (error) {
    console.error("failed to load questions", error);
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <p className="text-[15px] text-[var(--ink-soft)]">
          Couldn&apos;t reach the database. Check <code>DATABASE_URL</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-[13px] text-[var(--ink-soft)] hover:text-foreground">
          ← Back to today
        </Link>
        <h1 className="misprint font-heading text-3xl text-[var(--brand)]">Questions</h1>
        <p className="text-[15px] text-[var(--ink-soft)]">
          Your daily check-in asks these, in this order. Rewording a question only
          changes future check-ins. Past answers keep the wording they were given.
        </p>
      </div>

      <EditableList kind="question" items={data.questions} empty="No active questions. Add one below." />

      <div className="flex flex-col gap-1 pt-6">
        <h2 className="misprint font-heading text-3xl text-[var(--brand)]">Categories</h2>
        <p className="text-[15px] text-[var(--ink-soft)]">
          Every thought and check-in answer is sorted into these, and can fit several.
          Adding or rewording a category sorts all your entries again.
        </p>
      </div>

      {isClassifierConfigured() ? (
        <ClassifyNow initialPending={data.pending} />
      ) : (
        <p className="text-[15px] text-[var(--ink-soft)]">
          Classification is off. Set <code>TYPESAFE_API_KEY</code> to turn it on.
        </p>
      )}

      <EditableList kind="category" items={data.categories} empty="No active categories. Add one below." />
    </div>
  );
}
