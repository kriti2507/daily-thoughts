// Positions on the board are fractions (0..1) of the space a note can move
// in, so they survive any screen width.
export const BOARD_COLUMNS = 4;

const NOTE_COLORS = ["var(--note-1)", "var(--note-2)", "var(--note-3)", "var(--note-4)"];

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function noteColor(index: number): string {
  return NOTE_COLORS[index % NOTE_COLORS.length];
}

export function boardRows(count: number): number {
  return Math.max(1, Math.ceil(count / BOARD_COLUMNS));
}

// Where a note sits before it's ever been dragged.
export function defaultNotePosition(index: number, count: number): { x: number; y: number } {
  const rows = boardRows(count);
  const column = index % BOARD_COLUMNS;
  const row = Math.floor(index / BOARD_COLUMNS);
  return { x: column / (BOARD_COLUMNS - 1), y: rows > 1 ? row / (rows - 1) : 0 };
}
