import { Card, CardContent } from "@/components/ui/card";

export function Streak({ streak, isBest }: { streak: number; isBest: boolean }) {
  return (
    <Card className="col-span-1">
      <CardContent className="py-8 flex flex-col items-center justify-center">
        <p className="text-5xl font-black bg-gradient-to-br from-purple-500 to-pink-500 bg-clip-text text-transparent">
          {streak}
        </p>
        <p className="text-sm text-muted-foreground mt-1">days in a row</p>
        {isBest && (
          <p className="text-xs text-purple-500 font-medium mt-2">
            ✨ Personal best!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
