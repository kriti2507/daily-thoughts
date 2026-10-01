export type DayKeyAction =
  | { type: "shift"; delta: -1 | 1 }
  | { type: "today" }
  | { type: "compose" };

// Plain keys only, and never while something else owns the keyboard: a text
// field, an open dialog, or a post-it being nudged with the arrows.
export function keyToAction(
  key: string,
  context: { modified: boolean; busy: boolean },
): DayKeyAction | null {
  if (context.modified || context.busy) {
    return null;
  }
  switch (key) {
    case "ArrowLeft":
      return { type: "shift", delta: -1 };
    case "ArrowRight":
      return { type: "shift", delta: 1 };
    case "t":
      return { type: "today" };
    case "n":
      return { type: "compose" };
    default:
      return null;
  }
}

export const SWIPE_MIN_PX = 60;

// Like turning a page: the finger moving left goes forward a day.
export function swipeToDelta(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) {
    return 0;
  }
  return dx < 0 ? 1 : -1;
}
