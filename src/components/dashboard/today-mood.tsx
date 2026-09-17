import { Smile } from "lucide-react";
import type { TodayResponse } from "@/lib/api";

const MOOD_CONFIG = {
  good: { emoji: "😊", label: "Feeling Great", sublabel: "Positive & Energized" },
  neutral: { emoji: "😐", label: "Feeling Okay", sublabel: "Steady & Balanced" },
  bad: { emoji: "😔", label: "Feeling Low", sublabel: "Tough Day" },
};

export function TodayMood({ data }: { data: TodayResponse | null }) {
  if (!data) {
    return (
      <div className="col-span-1 md:col-span-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-subtle)] p-7 flex flex-col items-center justify-center min-h-[180px] transition-all duration-250">
        <p className="text-4xl mb-2">🌅</p>
        <p className="text-[var(--text-muted)]">No entry yet today</p>
      </div>
    );
  }

  const config = MOOD_CONFIG[data.mood] ?? MOOD_CONFIG.neutral;

  return (
    <div className="col-span-1 md:col-span-2 rounded-2xl bg-gradient-to-br from-[#FFFBEB] via-[#FFF7ED] to-[#FFF1E6] dark:from-[#2A2118] dark:via-[#302218] dark:to-[#352418] border border-[rgba(217,119,6,0.15)] p-7 transition-all duration-250 hover:shadow-[var(--shadow-lg),var(--shadow-glow-amber)] hover:-translate-y-0.5">
      <div className="flex items-center gap-1.5 mb-3">
        <Smile className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Today&apos;s Mood
        </span>
      </div>

      <div className="flex items-center gap-5 mb-4">
        <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-terracotta)] p-[3px] shadow-[0_4px_16px_rgba(217,119,6,0.2)]">
          <div className="w-full h-full rounded-full bg-white dark:bg-[var(--card)] flex items-center justify-center text-4xl">
            {config.emoji}
          </div>
        </div>
        <div>
          <h2 className="font-heading text-2xl font-bold">{config.label}</h2>
          <span className="text-sm font-semibold text-[var(--accent-amber)]">{config.sublabel}</span>
        </div>
      </div>

      <div className="bg-white/70 dark:bg-white/5 rounded-[10px] p-3.5 border border-[rgba(217,119,6,0.08)]">
        <p className="text-sm text-[var(--text-secondary)] italic leading-relaxed">
          <span className="font-accent text-[28px] text-[var(--accent-amber)] leading-none mr-1 align-text-top not-italic">
            &ldquo;
          </span>
          {data.response}
        </p>
      </div>
    </div>
  );
}
