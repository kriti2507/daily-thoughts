import { getToday, getStats } from "@/lib/api";
import { TodayMood } from "@/components/dashboard/today-mood";
import { Streak } from "@/components/dashboard/streak";
import { WeeklyMood } from "@/components/dashboard/weekly-mood";
import { GoalClarity } from "@/components/dashboard/goal-clarity";
import { MoodChart } from "@/components/dashboard/mood-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let today = null;
  let stats = null;
  try {
    [today, stats] = await Promise.all([getToday(), getStats()]);
  } catch {}

  const defaultClarity = {
    goal1: { name: "AI Expert", avg: 0 },
    goal2: { name: "Substack and Instagram", avg: 0 },
    goal3: { name: "Health", avg: 0 },
  };
  const defaultTrend = { goal1: "flat" as const, goal2: "flat" as const, goal3: "flat" as const };
  const emptyWeek = Array.from({ length: 7 }, () => ({ date: "", mood: null }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
      <TodayMood data={today} />
      <Streak streak={stats?.streak ?? 0} isBest={stats?.streak_is_best ?? false} />
      <WeeklyMood weeklyMoods={stats?.weekly_moods ?? emptyWeek} />
      <GoalClarity
        clarity={stats?.goal_clarity_avg_7d ?? defaultClarity}
        trend={stats?.goal_clarity_trend ?? defaultTrend}
      />
      <MoodChart weeklyMoods={stats?.weekly_moods ?? emptyWeek} />
    </div>
  );
}
