"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent } from "react";

import { keyToAction, swipeToDelta } from "@/lib/day-keys";
import { emit, FLIP_DAY, OPEN_COMPOSER } from "@/lib/ui-events";

// Things that keep their own keys: text fields, and anything marked
// data-keys-local (a post-it's tape, which arrows nudge).
const OWNS_KEYS = "input, textarea, select, [contenteditable='true'], [data-keys-local]";
// Swipes that start here are someone else's: notes, the dock, the header.
const OWNS_TOUCH = `${OWNS_KEYS}, .note, nav, header`;

function within(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

// ←/→ flip days, t jumps to today, n opens the composer; on phones a sideways
// swipe flips. Flips go through the tear-off calendar so they animate.
export function DayNavigation({ canCompose }: { canCompose: boolean }) {
  const router = useRouter();

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    // A held key would otherwise flip day after day, a page load each.
    if (event.repeat) {
      return;
    }
    const action = keyToAction(event.key, {
      modified: event.metaKey || event.ctrlKey || event.altKey,
      busy: within(event.target, OWNS_KEYS) || document.querySelector("dialog[open]") !== null,
    });
    if (action === null || (action.type === "compose" && !canCompose)) {
      return;
    }
    event.preventDefault();
    if (action.type === "shift") {
      emit(FLIP_DAY, { delta: action.delta });
    } else if (action.type === "today") {
      router.push("/");
    } else {
      emit(OPEN_COMPOSER);
    }
  });

  const onSwipe = useEffectEvent((delta: number) => {
    emit(FLIP_DAY, { delta });
  });

  useEffect(() => {
    let start: { x: number; y: number } | null = null;

    function handleKeyDown(event: KeyboardEvent) {
      onKey(event);
    }
    function handleTouchStart(event: TouchEvent) {
      start =
        event.touches.length === 1 && !within(event.target, OWNS_TOUCH)
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
          : null;
    }
    function handleTouchEnd(event: TouchEvent) {
      if (start === null) {
        return;
      }
      const touch = event.changedTouches[0];
      const delta = swipeToDelta(touch.clientX - start.x, touch.clientY - start.y);
      start = null;
      if (delta !== 0) {
        onSwipe(delta);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return null;
}
