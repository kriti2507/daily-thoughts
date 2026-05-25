import { getToday, getStats, getEntries } from "@/lib/api";
import { TodayMood } from "@/components/dashboard/today-mood";
import { Streak } from "@/components/dashboard/streak";
import { WeeklyMood } from "@/components/dashboard/weekly-mood";
import { GoalClarity } from "@/components/dashboard/goal-clarity";
import { MoodChart } from "@/components/dashboard/mood-chart";
import { RecentEntries } from "@/components/dashboard/recent-entries";

export const dynamic = "force-dynamic";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  let today = null;
  let stats = null;
  let entries: Awaited<ReturnType<typeof getEntries>> = [];

  try {
    [today, stats, entries] = await Promise.all([
      getToday(),
      getStats(),
      getEntries(7),
    ]);
  } catch {}

  const defaultClarity = {
    goal1: { name: "AI Expert", avg: 0 },
    goal2: { name: "Substack and Instagram", avg: 0 },
    goal3: { name: "Health", avg: 0 },
  };
  const defaultTrend = { goal1: "flat" as const, goal2: "flat" as const, goal3: "flat" as const };
  const emptyWeek = Array.from({ length: 7 }, () => ({ date: "", mood: null }));

  const streak = stats?.streak ?? 0;

  return (
    <div className="px-10 pt-7 pb-10 max-w-[1200px] mx-auto">
      <div className="mb-7">
        <h1 className="font-heading text-[28px] font-bold text-foreground">
          {getGreeting()}{" "}
          <span className="inline-block animate-[wave_2s_ease-in-out_infinite] origin-[70%_70%]">
            👋
          </span>
        </h1>
        {streak > 0 && (
          <p className="text-[15px] text-[var(--text-secondary)]">
            You&apos;ve reflected for{" "}
            <span className="font-accent text-xl font-semibold text-[var(--accent-amber)]">
              {streak} days straight
            </span>{" "}
            — keep going!
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <TodayMood data={today} />
        <Streak streak={streak} isBest={stats?.streak_is_best ?? false} />
        <WeeklyMood weeklyMoods={stats?.weekly_moods ?? emptyWeek} />
        <GoalClarity
          clarity={stats?.goal_clarity_avg_7d ?? defaultClarity}
          trend={stats?.goal_clarity_trend ?? defaultTrend}
        />
        <MoodChart weeklyMoods={stats?.weekly_moods ?? emptyWeek} />
        <RecentEntries entries={entries} />
      </div>

      <p className="font-accent text-lg text-[var(--text-muted)] text-center mt-8">
        keep showing up, keep growing ✦
      </p>
    </div>
  );
}
