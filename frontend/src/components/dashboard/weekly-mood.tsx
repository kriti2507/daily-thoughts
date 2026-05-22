import { Card, CardContent } from "@/components/ui/card";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const MOOD_STYLES: Record<string, string> = {
  good: "bg-purple-500 text-white",
  neutral: "bg-amber-400 text-white",
  bad: "bg-red-500 text-white",
};

const MOOD_EMOJI: Record<string, string> = {
  good: "😊",
  neutral: "😐",
  bad: "😔",
};

interface WeeklyMoodProps {
  weeklyMoods: Array<{ date: string; mood: string | null }>;
}

export function WeeklyMood({ weeklyMoods }: WeeklyMoodProps) {
  return (
    <Card className="col-span-1">
      <CardContent className="py-6 px-4">
        <p className="text-xs text-muted-foreground mb-3 font-medium">This Week</p>
        <div className="grid grid-cols-7 gap-1.5">
          {weeklyMoods.map((day, i) => (
            <div key={day.date || i} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{DAY_LABELS[i]}</span>
              <div
                className={`w-8 h-8 rounded-md flex items-center justify-center text-sm ${
                  day.mood
                    ? MOOD_STYLES[day.mood]
                    : "border-2 border-dashed border-muted-foreground/30"
                }`}
              >
                {day.mood ? MOOD_EMOJI[day.mood] : ""}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
