import { Card, CardContent } from "@/components/ui/card";
import type { TodayResponse } from "@/lib/api";

const MOOD_CONFIG = {
  good: { emoji: "\u{1F60A}", label: "Good", gradient: "from-purple-500 to-blue-500" },
  neutral: { emoji: "\u{1F610}", label: "Neutral", gradient: "from-amber-500 to-orange-400" },
  bad: { emoji: "\u{1F614}", label: "Bad", gradient: "from-red-500 to-pink-500" },
};

export function TodayMood({ data }: { data: TodayResponse | null }) {
  if (!data) {
    return (
      <Card className="col-span-1 md:col-span-2 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-4xl mb-2">{"\u{1F305}"}</p>
          <p className="text-muted-foreground">No entry yet today</p>
        </CardContent>
      </Card>
    );
  }

  const config = MOOD_CONFIG[data.mood] ?? MOOD_CONFIG.neutral;

  return (
    <Card className={`col-span-1 md:col-span-2 bg-gradient-to-br ${config.gradient} text-white`}>
      <CardContent className="py-8 px-6">
        <div className="flex items-center gap-4">
          <span className="text-5xl">{config.emoji}</span>
          <div>
            <p className="text-2xl font-bold">{config.label}</p>
            <p className="text-white/80 text-sm mt-1 line-clamp-2">{data.response}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
