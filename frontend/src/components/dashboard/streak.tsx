import { Zap } from "lucide-react";

export function Streak({ streak, isBest }: { streak: number; isBest: boolean }) {
  return (
    <div className="col-span-1 rounded-2xl bg-gradient-to-br from-[var(--accent-amber)] to-[#B45309] text-white p-6 flex flex-col items-center justify-center min-h-[180px] transition-all duration-250 hover:shadow-[var(--shadow-lg),0_0_30px_rgba(217,119,6,0.25)] hover:-translate-y-0.5">
      <div className="flex items-center gap-1.5 mb-3">
        <Zap className="w-3.5 h-3.5 text-white/70" />
        <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
          Streak
        </span>
      </div>

      <span className="font-heading text-[56px] font-bold leading-none mb-1" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        {streak}
      </span>
      <span className="text-[13px] text-white/80 font-medium">days in a row</span>

      {isBest && (
        <span className="mt-2.5 inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold">
          ✨ Personal Best!
        </span>
      )}
    </div>
  );
}
