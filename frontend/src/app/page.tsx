import { getToday, getStats } from "@/lib/api";
import { TodayMood } from "@/components/dashboard/today-mood";
import { Streak } from "@/components/dashboard/streak";
import { WeeklyMood } from "@/components/dashboard/weekly-mood";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let today = null;
  let stats = null;
  try {
    [today, stats] = await Promise.all([getToday(), getStats()]);
  } catch {}

  const emptyWeek = Array.from({ length: 7 }, (_, i) => ({ date: "", mood: null }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
      <TodayMood data={today} />
      <Streak streak={stats?.streak ?? 0} isBest={stats?.streak_is_best ?? false} />
      <WeeklyMood weeklyMoods={stats?.weekly_moods ?? emptyWeek} />
    </div>
  );
}
