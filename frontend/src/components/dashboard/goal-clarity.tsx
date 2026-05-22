import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { StatsResponse } from "@/lib/api";

const GOAL_COLORS: Record<string, string> = {
  goal1: "text-purple-500 [&_[data-slot=progress-indicator]]:bg-purple-500",
  goal2: "text-pink-500 [&_[data-slot=progress-indicator]]:bg-pink-500",
  goal3: "text-blue-500 [&_[data-slot=progress-indicator]]:bg-blue-500",
};

const TREND_ICONS = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

interface GoalClarityProps {
  clarity: StatsResponse["goal_clarity_avg_7d"];
  trend: StatsResponse["goal_clarity_trend"];
}

export function GoalClarity({ clarity, trend }: GoalClarityProps) {
  const goals = ["goal1", "goal2", "goal3"] as const;

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardContent className="py-6 space-y-4">
        <p className="text-xs text-muted-foreground font-medium">Goal Clarity (7-day avg)</p>
        {goals.map((key) => {
          const goal = clarity[key];
          const trendDir = trend[key] ?? "flat";
          const TrendIcon = TREND_ICONS[trendDir];
          if (!goal) return null;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{goal.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="tabular-nums">{goal.avg}/10</span>
                  <TrendIcon className={`h-3.5 w-3.5 ${
                    trendDir === "up" ? "text-green-500" : trendDir === "down" ? "text-red-500" : "text-muted-foreground"
                  }`} />
                </div>
              </div>
              <Progress value={goal.avg * 10} className={GOAL_COLORS[key]} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
