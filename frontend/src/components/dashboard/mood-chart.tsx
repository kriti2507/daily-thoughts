"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const MOOD_VALUE: Record<string, number> = {
  good: 3,
  neutral: 2,
  bad: 1,
};

const MOOD_COLOR: Record<string, string> = {
  good: "#a855f7",
  neutral: "#f59e0b",
  bad: "#ef4444",
};

interface MoodChartProps {
  weeklyMoods: Array<{ date: string; mood: string | null }>;
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
    <Card className="col-span-1 md:col-span-2">
      <CardContent className="py-6">
        <p className="text-xs text-muted-foreground font-medium mb-4">Mood This Week</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData}>
            <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} />
            <YAxis
              domain={[0, 3]}
              ticks={[1, 2, 3]}
              tickFormatter={(v) => (v === 3 ? "Good" : v === 2 ? "Neutral" : v === 1 ? "Bad" : "")}
              axisLine={false}
              tickLine={false}
              fontSize={11}
              width={50}
            />
            <Tooltip
              formatter={(value) => {
                const v = Number(value);
                return v === 3 ? "Good" : v === 2 ? "Neutral" : v === 1 ? "Bad" : "—";
              }}
              labelFormatter={(label) => String(label)}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.mood ? MOOD_COLOR[entry.mood] : "#e5e7eb"}
                  opacity={entry.mood ? 1 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
