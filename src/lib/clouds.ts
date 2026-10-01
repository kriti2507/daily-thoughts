export type CloudSize = "s" | "m" | "l";

export function cloudSize(text: string): CloudSize {
  if (text.length <= 60) {
    return "s";
  }
  if (text.length <= 240) {
    return "m";
  }
  return "l";
}

// A stable number in [0, 1) from an integer seed, so the server and the
// browser draw the same sky without storing any layout. One round of the
// mulberry32 mixer; `salt` gives independent values for the same seed.
export function seeded(seed: number, salt: number): number {
  let t = (Math.imul(seed, 0x9e3779b1) + Math.imul(salt + 1, 0x85ebca6b)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function between(min: number, max: number, unit: number): number {
  return Math.round((min + (max - min) * unit) * 100) / 100;
}

export interface Jitter {
  tilt: number; // degrees
  offsetY: number; // px
  bobSeconds: number;
  bobDelay: number; // seconds
}

// Used for clouds (seeded by message id) and post-its (by question id).
export function cloudJitter(seed: number): Jitter {
  return {
    tilt: between(-3, 3, seeded(seed, 0)),
    offsetY: between(0, 16, seeded(seed, 1)),
    bobSeconds: between(4, 7, seeded(seed, 2)),
    bobDelay: between(0, 3, seeded(seed, 3)),
  };
}
