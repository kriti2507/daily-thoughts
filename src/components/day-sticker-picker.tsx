"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setDayStickerAction } from "@/app/checkin-actions";
import { STICKER_NAMES, STICKERS } from "@/lib/sticker-list";
import type { Sticker } from "@/lib/sticker-list";
import { cn } from "@/lib/utils";

// Saves on tap; tapping the chosen sticker again clears it.
export function DayStickerPicker({ day, initial }: { day: string; initial: string | null }) {
  const [chosen, setChosen] = useState<string | null>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function pick(sticker: Sticker) {
    const previous = chosen;
    const next = sticker === chosen ? null : sticker;
    setChosen(next);
    startTransition(async () => {
      try {
        const result = await setDayStickerAction(day, next);
        if (!result.ok) {
          setChosen(previous);
          window.alert("This day has ended.");
          router.refresh();
        }
      } catch (error) {
        console.error("failed to set day sticker", error);
        setChosen(previous);
        window.alert("Couldn't save the sticker.");
      }
    });
  }

  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[var(--ink-soft)]">
        Today&apos;s sticker
      </legend>
      <div className="flex flex-wrap gap-2">
        {STICKERS.map((sticker) => (
          <button
            key={sticker}
            type="button"
            aria-pressed={sticker === chosen}
            aria-label={STICKER_NAMES[sticker]}
            disabled={isPending}
            onClick={() => pick(sticker)}
            className={cn(
              "flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-2xl transition-transform duration-150 hover:-rotate-6 hover:scale-110 disabled:cursor-wait",
              sticker === chosen ? "pop scale-110 bg-[var(--note-1)]" : "opacity-70 hover:opacity-100",
            )}
          >
            <span aria-hidden>{sticker}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
