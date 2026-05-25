"use client";

import { BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const MOOD_VALUE: Record<string, number> = { good: 3, neutral: 2, bad: 1 };
const MOOD_COLOR: Record<string, string> = {
  good: "#059669",
  neutral: "#D97706",
  bad: "#E11D48",
};
const MOOD_LABEL: Record<string, string> = { good: "Good", neutral: "Neutral", bad: "Bad" };

interface MoodChartProps {
  weeklyMoods: Array<{ date: string; mood: string | null }>;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { mood: string | null } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const mood = payload[0].payload.mood;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-3 py-2 shadow-[var(--shadow-md)]">
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-xs text-[var(--text-secondary)]">{mood ? MOOD_LABEL[mood] : "No entry"}</p>
    </div>
  );
}

export function MoodChart({ weeklyMoods }: MoodChartProps) {
  const chartData = weeklyMoods.map((day) => {
    const date = new Date(day.date + "T00:00:00");
    const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" });
    return {
      day: dayLabel,
      value: day.mood ? MOOD_VALUE[day.mood] : 0,
      mood: day.mood,
    };
  });

  return (
    <div className="col-span-1 md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 transition-all duration-250 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 hover:border-[var(--border-strong)]">
      <div className="flex items-center gap-1.5 mb-4">
        <BarChart3 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Mood Over Time
        </span>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData}>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            fontSize={11}
            fontWeight={600}
            tick={{ fill: "var(--text-muted)" }}
          />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Bar dataKey="value" radius={[8, 8, 4, 4]} maxBarSize={40}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.mood ? MOOD_COLOR[entry.mood] : "var(--bg-subtle)"}
                opacity={entry.mood ? 1 : 0.3}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
