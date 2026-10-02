"use client";

import { useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { X } from "lucide-react";

import { deleteMessageAction } from "@/app/actions";
import { CategoryTapes } from "@/components/category-tapes";
import { CloudShape } from "@/components/cloud-shape";
import { cloudJitter } from "@/lib/clouds";
import type { CloudSize } from "@/lib/clouds";
import { afterAnimation } from "@/lib/ui-events";
import { cn } from "@/lib/utils";

const PUFF_MS = 400;

const SIZE_CLASSES: Record<CloudSize, string> = {
  s: "max-w-[240px] text-[17px]",
  m: "max-w-[340px] text-[15px]",
  l: "max-w-[520px] text-[14px]",
};

export function ThoughtCloud({
  id,
  text,
  size,
  time,
  isoTime,
  source,
  canDelete,
  tags,
}: {
  id: number;
  text: string;
  size: CloudSize;
  time: string;
  isoTime: string;
  source: string;
  canDelete: boolean;
  tags: string[];
}) {
  const [isPuffing, setIsPuffing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { tilt, offsetY, bobSeconds, bobDelay } = cloudJitter(id);

  // The cloud puffs away first, then the row is deleted. If that fails it
  // comes back.
  function handleDelete() {
    if (!window.confirm("Delete this thought? This can't be undone.")) {
      return;
    }
    setIsPuffing(true);
    startTransition(async () => {
      await afterAnimation(PUFF_MS);
      try {
        await deleteMessageAction(id);
      } catch (error) {
        console.error("failed to delete message", error);
        setIsPuffing(false);
        window.alert("Couldn't delete the thought.");
      }
    });
  }

  // Bobbing and puffing live on separate elements: .is-puffing replaces the
  // bob animation on whichever element it's applied to, so putting both on
  // the same node would cancel the bob mid-flight and make the cloud jump.
  return (
    <li
      className="bobbing"
      style={
        {
          "--bob-duration": `${bobSeconds}s`,
          "--bob-delay": `-${bobDelay}s`,
          marginTop: offsetY,
        } as CSSProperties
      }
    >
      <div
        className={cn(
          "cloud group min-w-[180px] px-9 pb-9 pt-12",
          SIZE_CLASSES[size],
          isPuffing && "is-puffing",
        )}
        style={{ "--tilt": `${tilt}deg` } as CSSProperties}
      >
        <CloudShape />
        <p className="whitespace-pre-wrap wrap-anywhere leading-snug">{text}</p>
        <CategoryTapes tags={tags} />
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--ink-soft)]">
          <span>
            <time dateTime={isoTime}>{time}</time> · via {source}
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full opacity-0 transition-opacity duration-200 hover:bg-[var(--note-1)] focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-wait [@media(hover:none)]:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Delete thought</span>
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
