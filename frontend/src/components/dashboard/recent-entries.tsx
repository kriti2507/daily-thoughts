import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import type { EntryResponse } from "@/lib/api";

const MOOD_EMOJI: Record<string, string> = {
  good: "😊",
  neutral: "😐",
  bad: "😔",
};

function primaryGoalTag(entry: EntryResponse): string | null {
  if (entry.goal1_done_today) return "AI Expert";
  if (entry.goal2_done_today) return "Substack";
  if (entry.goal3_done_today) return "Health";
  return null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentEntries({ entries }: { entries: EntryResponse[] }) {
  if (entries.length === 0) {
    return (
      <Card className="col-span-full">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No entries yet. Start journaling via Telegram!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full">
      <CardContent className="py-4 px-0">
        <p className="text-xs text-muted-foreground font-medium px-6 mb-3">Recent Entries</p>
        <div className="max-h-80 overflow-y-auto">
          {entries.map((entry) => {
            const tag = primaryGoalTag(entry);
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <span className="text-xl flex-shrink-0">
                  {entry.mood ? MOOD_EMOJI[entry.mood] : "⬜"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{entry.response}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(entry.sent_at)}
                  </p>
                </div>
                {tag && (
                  <Badge variant="secondary" className="flex-shrink-0 text-xs">
                    {tag}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
