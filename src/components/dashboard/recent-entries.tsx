import { FileText } from "lucide-react";
import type { EntryResponse } from "@/lib/api";

const MOOD_EMOJI: Record<string, string> = { good: "😊", neutral: "😐", bad: "😔" };

const MOOD_BG: Record<string, string> = {
  good: "bg-[var(--accent-sage-light)]",
  neutral: "bg-[var(--accent-amber-light)]",
  bad: "bg-[var(--accent-rose-light)]",
};

function goalTags(entry: EntryResponse): string[] {
  const tags: string[] = [];
  if (entry.goal1_done_today) tags.push("AI Expert");
  if (entry.goal2_done_today) tags.push("Substack");
  if (entry.goal3_done_today) tags.push("Health");
  return tags;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentEntries({ entries }: { entries: EntryResponse[] }) {
  if (entries.length === 0) {
    return (
      <div className="col-span-full rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-subtle)] p-12 text-center">
        <p className="text-[var(--text-muted)]">No entries yet. Start journaling via Telegram!</p>
      </div>
    );
  }

  return (
    <div className="col-span-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 transition-all duration-250 hover:shadow-[var(--shadow-lg)] hover:border-[var(--border-strong)]">
      <div className="flex items-center gap-1.5 mb-4">
        <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Recent Entries
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {entries.map((entry) => {
          const tags = goalTags(entry);
          return (
            <div
              key={entry.id}
              className="flex items-center gap-3.5 px-4 py-3 rounded-[10px] border border-transparent transition-all duration-200 cursor-pointer hover:bg-[var(--bg-subtle)] hover:border-[var(--border)]"
            >
              <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-lg flex-shrink-0 ${
                entry.mood ? MOOD_BG[entry.mood] : "bg-[var(--bg-subtle)]"
              }`}>
                {entry.mood ? MOOD_EMOJI[entry.mood] : "⬜"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{entry.response}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {tags.length > 0 ? tags.join(" · ") : ""}
                </p>
              </div>
              <span className="text-[13px] text-[var(--text-muted)] font-medium flex-shrink-0">
                {formatDate(entry.sent_at)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
