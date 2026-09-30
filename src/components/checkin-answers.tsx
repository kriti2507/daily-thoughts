import type { Answer } from "@/lib/checkins";

// Shows the question as it was worded when answered, not its current wording.
export function CheckinAnswers({ answers }: { answers: Answer[] }) {
  if (answers.length === 0) {
    return <p className="text-[15px] text-[var(--text-secondary)]">No check-in this day.</p>;
  }
  return (
    <dl className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-card px-5 py-4">
      {answers.map((answer) => (
        <div key={answer.questionId}>
          <dt className="text-[13px] font-medium text-[var(--text-muted)]">
            {answer.questionText}
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{answer.text}</dd>
        </div>
      ))}
    </dl>
  );
}
