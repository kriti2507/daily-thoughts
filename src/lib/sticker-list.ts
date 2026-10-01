// Kept apart from lib/stickers.ts (the database side) so client components
// can import the list without pulling in the database driver.
export const STICKERS = ["☀️", "🌤", "🌧", "⛈", "🔥", "🌱", "🌈", "⚡️", "🫠", "😌"] as const;

export type Sticker = (typeof STICKERS)[number];

// Read out by screen readers in place of the emoji.
export const STICKER_NAMES: Record<Sticker, string> = {
  "☀️": "sunny",
  "🌤": "bright",
  "🌧": "rainy",
  "⛈": "stormy",
  "🔥": "on fire",
  "🌱": "growing",
  "🌈": "hopeful",
  "⚡️": "wired",
  "🫠": "melting",
  "😌": "at peace",
};

export function isSticker(value: unknown): value is Sticker {
  return typeof value === "string" && (STICKERS as readonly string[]).includes(value);
}
