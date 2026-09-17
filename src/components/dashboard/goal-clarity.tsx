import { CheckCircle, Bot, PenTool, Heart, ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { StatsResponse } from "@/lib/api";

const GOAL_CONFIG = {
  goal1: {
    icon: Bot,
    iconClass: "text-[var(--accent-violet)]",
    bgClass: "bg-[var(--accent-violet-light)]",
    pctClass: "text-[var(--accent-violet)]",
    barGradient: "linear-gradient(90deg, #7C3AED, #A78BFA)",
  },
  goal2: {
    icon: PenTool,
    iconClass: "text-[var(--accent-terracotta)]",
    bgClass: "bg-[var(--accent-terracotta-light)]",
    pctClass: "text-[var(--accent-terracotta)]",
    barGradient: "linear-gradient(90deg, #C2410C, #FB923C)",
  },
  goal3: {
    icon: Heart,
    iconClass: "text-[var(--accent-sage)]",
    bgClass: "bg-[var(--accent-sage-light)]",
    pctClass: "text-[var(--accent-sage)]",
    barGradient: "linear-gradient(90deg, #059669, #34D399)",
  },
} as const;

const TREND_ICONS = { up: ArrowUp, down: ArrowDown, flat: Minus };

interface GoalClarityProps {
  clarity: StatsResponse["goal_clarity_avg_7d"];
  trend: StatsResponse["goal_clarity_trend"];
}

export function GoalClarity({ clarity, trend }: GoalClarityProps) {
  const goals = ["goal1", "goal2", "goal3"] as const;

  return (
    <div className="col-span-1 md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 transition-all duration-250 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 hover:border-[var(--border-strong)]">
      <div className="flex items-center gap-1.5 mb-4">
        <CheckCircle className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Goal Clarity
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {goals.map((key) => {
          const goal = clarity[key];
          const config = GOAL_CONFIG[key];
          const trendDir = trend[key] ?? "flat";
          const TrendIcon = TREND_ICONS[trendDir];
          const pct = Math.round(goal.avg * 10);
          if (!goal) return null;

          const Icon = config.icon;

          return (
            <div key={key} className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bgClass}`}>
                <Icon className={`w-5 h-5 ${config.iconClass}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">{goal.name}</span>
                  <span className={`text-[13px] font-heading font-bold ${config.pctClass}`}>{pct}%</span>
                </div>
                <div className="h-2 rounded bg-[var(--bg-subtle)] overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-[800ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                    style={{ width: `${pct}%`, background: config.barGradient }}
                  />
                </div>
                <div className={`text-[11px] mt-1 flex items-center gap-1 ${
                  trendDir === "up" ? "text-[var(--accent-sage)]" : trendDir === "down" ? "text-[var(--accent-rose)]" : "text-[var(--text-muted)]"
                }`}>
                  <TrendIcon className="w-3 h-3" />
                  <span>{trendDir === "up" ? "Trending up" : trendDir === "down" ? "Trending down" : "Steady"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
