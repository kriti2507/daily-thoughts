// Window-level events so far-apart client components can talk without a
// shared provider: the keyboard handler asks the calendar to flip, the board
// tells the calendar to stamp, and so on. Browser only.
export const FLIP_DAY = "daily-thoughts:flip-day"; // detail: { delta: -1 | 1 }
export const OPEN_COMPOSER = "daily-thoughts:open-composer";
export const CHECKIN_SAVED = "daily-thoughts:checkin-saved"; // detail: { filled: boolean }

export function emit(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Resolves once an exit animation has had time to play, or straight away when
// motion is reduced (the CSS skips the animation then too).
export function afterAnimation(ms: number): Promise<void> {
  if (prefersReducedMotion()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
