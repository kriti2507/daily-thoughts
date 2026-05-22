import { getToday } from "@/lib/api";
import { TodayMood } from "@/components/dashboard/today-mood";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let today = null;
  try {
    today = await getToday();
  } catch {}

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
      <TodayMood data={today} />
    </div>
  );
}
