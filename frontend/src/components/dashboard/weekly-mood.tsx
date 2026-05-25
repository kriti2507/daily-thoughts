import { Calendar } from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MOOD_BG: Record<string, string> = {
  good: "bg-gradient-to-br from-[var(--accent-sage-light)] to-[#D1FAE5] dark:from-[var(--accent-sage-light)] dark:to-[#1A3D2A]",
  neutral: "bg-gradient-to-br from-[var(--accent-amber-light)] to-[#FDE68A] dark:from-[var(--accent-amber-light)] dark:to-[#3D2E22]",
  bad: "bg-gradient-to-br from-[var(--accent-rose-light)] to-[#FECDD3] dark:from-[var(--accent-rose-light)] dark:to-[#3D1A1A]",
};

const MOOD_EMOJI: Record<string, string> = {
  good: "😊",
  neutral: "😐",
  bad: "😔",
};

interface WeeklyMoodProps {
  weeklyMoods: Array<{ date: string; mood: string | null }>;
}

export function WeeklyMood({ weeklyMoods }: WeeklyMoodProps) {
  return (
    <div className="col-span-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 transition-all duration-250 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 hover:border-[var(--border-strong)]">
      <div className="flex items-center gap-1.5 mb-3">
        <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          This Week
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {weeklyMoods.map((day, i) => (
          <div
            key={day.date || i}
            className={`aspect-square rounded-[10px] flex flex-col items-center justify-center text-xl transition-transform duration-200 hover:scale-110 ${
              day.mood
                ? MOOD_BG[day.mood]
                : "bg-[var(--bg-subtle)] border border-dashed border-[var(--border)]"
            }`}
          >
            <span>{day.mood ? MOOD_EMOJI[day.mood] : ""}</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)] mt-0.5">
              {DAY_LABELS[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
