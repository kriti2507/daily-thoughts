# Sky & Board Redesign — Design

**Date:** 2026-10-01
**Status:** Approved

## Summary

Day 5 of the build, moved forward from Day 7: the whole app gets a bold,
playful look so it's a page people love on sight. Random thoughts float as
clouds in a "sky"; check-in answers are post-it notes on a "board". A calm/loud
switch swaps the loud Riso Pop theme for a quiet Sage Morning one. The calendar
leaves the centre: a tear-off desk calendar on desktop, a timeline dock on
phones.

All nine extra ideas from brainstorming ship today. The AI analysis and chat
move to later days; this design only leaves room for them.

**Done when:** I open the page and see today's thoughts as clouds and my
check-in as post-its I write on, can flip days on the tear-off calendar (or the
dock on my phone), and can switch between calm and loud.

## Decisions

- **Two themes, one switch.** `calm · LOUD` pill in the header replaces the
  sun/moon toggle. Loud is the default. Stored by `next-themes` (localStorage,
  no flash on load).
- **Dark mode only for calm.** Calm follows the system's `prefers-color-scheme`
  and becomes "calm at night". Loud is always bright. No separate dark toggle.
- **Calendar placement.** Desktop (≥ `md`): a tear-off desk calendar sticker in
  the top-right of the day. Phones: a floating timeline dock at the bottom.
- **Everything visitors could see before, they still see.** Clouds, the
  calendar, the dots for days with thoughts, mind weather. Everything tied to
  check-ins (post-its, the stamp, day stickers, check-in dots) stays owner-only.
- **Only today is writable,** as before: today's post-its and today's sticker.
  Dragging post-its works on any day, since it changes layout, not content.
- **Nothing AI is built.** Clouds get an empty slot for a future mood sticker
  and pattern tape; weather is computed by one swappable function; no
  placeholder icons are rendered.

## Themes

Tokens live in `globals.css` under `[data-mode="loud"]`, `[data-mode="calm"]`
and `@media (prefers-color-scheme: dark) { [data-mode="calm"] { … } }`. The
honey palette and its shadcn variables are replaced; every component reads the
tokens, never raw colours.

`next-themes` is configured with `attribute="data-mode"`,
`themes={["loud", "calm"]}`, `defaultTheme="loud"`, `enableSystem={false}`.

| Token | Loud (Riso Pop) | Calm (Sage Morning) | Calm at night |
|---|---|---|---|
| `--paper` (page) | `#FFF1DC` | `#E9EFE6` | `#1B221E` |
| `--surface` (clouds, cards) | `#FFFFFF` | `#FFFFFF` | `#26302A` |
| `--ink` (text, outlines) | `#111111` | `#33433A` | `#E3EBE4` |
| `--ink-soft` (secondary text) | `#4A4038` | `#52645A` | `#A9B8AE` |
| `--brand` (title, selected) | `#2340FF` | `#3E5A4A` | `#9CC3AA` |
| `--note-1` | `#FFE600` | `#F5EBCB` | `#5A5238` |
| `--note-2` | `#FF48B0` | `#F0D9D9` | `#5A3F44` |
| `--note-3` | `#9EE6FF` | `#D6E4EE` | `#3A4A57` |
| `--note-4` | `#B8F5A0` | `#DDEAD3` | `#3E5040` |
| `--stamp` | `#C8191F` | `#A64B46` | `#D98A84` |
| `--line` (outline width) | `2.5px` | `0px` | `0px` |
| `--shadow` | `4px 4px 0 var(--ink)` | `0 6px 14px rgb(62 90 74 / .15)` | `0 6px 14px rgb(0 0 0 / .35)` |

Note text is always `--ink` (never white) so pink/yellow notes keep contrast.
Every text/background pair is checked at ≥ 4.5:1 during implementation.

**Typography.** Headings: Bricolage Grotesque 800 (`--font-heading`).
Post-it text: Caveat 600 (`--font-accent`, already loaded). Body: Inter.
Quicksand is removed.

**Printed look (loud only).** The title gets a `--note-2` misprint offset
(`text-shadow: 3px 2px 0`). A paper-grain SVG noise overlay sits on `body`
(fixed, `pointer-events: none`) at 0.35 opacity in loud, 0.15 in calm.

## Page layout

Top to bottom inside `<main>`, max width ~960px:

1. **Header** (sticky): title with misprint, then on the right: questions icon
   (owner), "New thought" button (owner), `calm · LOUD` switch.
2. **Day bar:** day heading (`Thursday, 1 October`) and the mind-weather label
   on the left; the tear-off calendar on the right (desktop only).
3. **Sky:** the day's thoughts as clouds.
4. **Board** (owner only): the check-in as post-its, and the day-sticker picker
   on today.
5. **Dock** (phones only): fixed to the bottom; the page gets bottom padding so
   nothing hides behind it.

`/questions` is restyled with the same tokens and fonts; its behaviour is
unchanged.

## Components

### Tear-off calendar (`tear-off-calendar.tsx`, client)

A page-a-day sticker rotated 3°: brand-coloured month strip, big day number,
weekday, the day's sticker (owner, if set), and the "CHECKED IN" stamp (owner,
if the day has answers). Controls: `‹` previous day, `›` next day, `▦` opens
the month popover.

- `‹`/`›` play the tear animation (the page rotates up on `rotateX` and
  fades, ~300ms), then `router.push("/?day=…")`. The new page drops in with a
  short settle animation, keyed on the day.
- The month popover reuses the existing `MonthCalendar` grid (restyled) inside
  a centred modal `<dialog>`. Picking a day closes it; the month arrows inside
  it don't, so months can be browsed.
- Next-day is allowed into the future, as the month grid already allows.

### Timeline dock (`timeline-dock.tsx`, client)

A black pill fixed at the bottom on phones: month label (tap → same month
popover), then one dot per day of the selected month in a horizontal scroller
that auto-scrolls the selected day into the centre. A dot is:

- the day's sticker emoji if set (owner),
- filled `--note-1` if the day has thoughts, `--note-2` if it has a check-in
  (owner), dim otherwise,
- larger and outlined in `--brand` for the selected day.

Each dot is a `Link` to `/?day=…` with the same `aria-label` the month grid
uses. `‹`/`›` at the ends move a month.

### Clouds (`thought-cloud.tsx`, `sky.tsx`)

Each thought is a cloud: a `--surface` body with three bump circles, outlined
as one shape by a stack of drop-shadow filters (`--cloud-filter`; soft shadow
only in calm). It stretches with
its content, so any length up to 4096 characters fits: a pure helper in
`lib/clouds.ts`,
`cloudSize(text)` returns `"s" | "m" | "l"` (≤ 60, ≤ 240, longer) and sets
max-width and padding. Time and "via Telegram/web" sit small under the text.

- Layout is a wrapping flex row with small deterministic offsets and tilts
  seeded from the message id (`cloudJitter(id)`), so server and client render
  the same and nothing overlaps. Still a `<ul>`, so it reads as a list.
- **Living clouds:** each bobs (`translateY` ±6px) with a duration of 4–7s and
  a delay from `cloudJitter`.
- **Delete** (owner): a small × on hover/focus. On confirm the cloud plays a
  puff (scale up, blur, fade, ~400ms) before the server action runs; if the
  action fails it reappears and the existing error alert shows.
- **AI slot:** a comment in `thought-cloud.tsx` marks where the mood sticker
  (top-left) and pattern tape (bottom) go; nothing is rendered today.
- Empty sky: a sun sticker and "Clear skies. No thoughts this day."

### Mind weather (`lib/weather.ts`)

`mindWeather(thoughtCount)` → `{ kind, label }`:

| Thoughts | Kind | Label |
|---|---|---|
| 0 | `clear` | ☀ Clear skies |
| 1–3 | `fair` | 🌤 Fair, a few clouds |
| 4–7 | `cloudy` | ☁ Cloudy mind |
| 8+ | `stormy` | ⛈ Stormy mind |

The label shows in the day bar. The sky band's background tint follows `kind`
(clear: plain paper; stormy: a slightly darker `--note-3` wash). The AI day
replaces this function's input with mood tags.

### Board and post-its (`board.tsx`, `post-it.tsx`, client)

Replaces `CheckinForm` and `CheckinAnswers`.

- **Today:** one blank post-it per active question, colours cycling `--note-1…4`,
  each tilted from `cloudJitter(questionId)`. The question is the small
  uppercase label (`<label>`); the answer is a borderless `<textarea>` in
  Caveat (it grows with its text on phones; on desktop notes are a fixed
  13rem × 12rem and scroll inside, so they can be placed freely). One "Stick it" button and ⌘/Ctrl+Enter save
  all answers through the existing `saveCheckinAction`, keeping every existing
  status (saved / day-ended / questions-changed / error) and draft-preserving
  behaviour. On success each filled note plays the slap animation (drop from
  above, overshoot, settle, staggered 60ms) and the stamp thunks onto the
  calendar.
- **Past days:** the same notes, read-only, showing the stored question wording.
  "No check-in this day." if empty.
- **No questions:** a dashed box linking to `/questions`.

**Drag (desktop, owner, any day).** Notes are positioned on a board whose
height follows the number of rows (four notes per row, at least 20rem). A note with a saved position is placed at `(x, y)` as fractions
(0–1) of the board; notes without one fall into a default grid. Pointer events
drag a note (with a lifted shadow); on drop the position is saved through
`moveNoteAction`. Keyboard: a focused note's drag handle moves it with arrow
keys (5% per press), saved on blur. On phones (< `md`) notes are a plain
two-column grid and dragging is off. Today's unsaved notes can be dragged, but
the position only persists once the answer exists.

### Day sticker (`day-sticker-picker.tsx`, client)

On today's board, a row of stickers: ☀️ 🌤 🌧 ⛈ 🔥 🌱 🌈 ⚡️ 🫠 😌. Tapping one
saves immediately through `setDayStickerAction`; tapping the chosen one clears
it. It appears on the tear-off calendar page and as the day's dot in the dock.
Owner-only, today only.

### Composer as a cloud (`compose-dialog.tsx`)

The "New entry" dialog becomes "New thought": the `<dialog>` is styled as a
cloud (same cloud styles, large). On a successful save, the dialog content
plays the rise animation (translate up and fade, ~600ms) before closing.
Failures behave exactly as now. It opens from the header button or the `n` key.

### Keyboard and swipe (`day-navigation.tsx`, client)

A small client component mounted once on the page:

- `←`/`→`: previous/next day, through the tear-off calendar's animated flip.
- `t`: today. `n`: open the composer (via a custom `open-composer` event the
  dialog listens for).
- Ignored when focus is in an input, textarea, contenteditable, or an open
  dialog, or when a modifier key is held.
- Phones: a horizontal swipe on the sky/board (≥ 60px, more horizontal than
  vertical, not starting on a note or textarea) moves a day.

Pure helpers in `lib/day-keys.ts`: `shiftDay(day, delta)` (added to
`lib/days.ts`), `keyToAction(key, { modified, busy })` (the component works
out `busy` from the focused element and open dialogs), `swipeToDelta(dx, dy)`.

## Motion

All animations are CSS keyframes in `globals.css`: `bob`, `puff`, `slap`,
`stamp`, `tear`, `settle`, `rise`. The existing `prefers-reduced-motion` rule
already reduces them to near-zero; JS that waits for an animation (puff, tear,
rise) also checks `matchMedia("(prefers-reduced-motion: reduce)")` and skips the
wait.

## Data model

Append to `db/schema.sql` (idempotent, as before):

```sql
-- Where a post-it sits on the board, as fractions of the board's size.
-- NULL means "default grid position".
ALTER TABLE answers ADD COLUMN IF NOT EXISTS board_x REAL
  CHECK (board_x BETWEEN 0 AND 1);
ALTER TABLE answers ADD COLUMN IF NOT EXISTS board_y REAL
  CHECK (board_y BETWEEN 0 AND 1);

-- One sticker per day, part of the private check-in.
CREATE TABLE IF NOT EXISTS day_stickers (
  day         DATE         PRIMARY KEY,
  sticker     TEXT         NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

`upsertAnswer` keeps `board_x`/`board_y` untouched on update.

Library additions:

- `lib/checkins.ts`: `Answer` gains `boardX`/`boardY` (`number | null`);
  `setAnswerPosition(day, questionId, x, y)`.
- `lib/sticker-list.ts` (no database, safe on the client): `STICKERS`,
  `STICKER_NAMES`, `isSticker`.
- `lib/stickers.ts`: `listDayStickers(from, to)`, `setDaySticker(day, sticker)`,
  `clearDaySticker(day)`. The page reads the day's sticker from the month's
  list, so there's no `getDaySticker`.

## Server actions

In `checkin-actions.ts`, each with `requireAdmin()` and full input validation
like the existing ones:

- `moveNoteAction(day, questionId, x, y)`: valid day (`parseDay`), valid id,
  `x`/`y` finite numbers clamped to 0–1. Any day. Updates only an existing
  answer (no-op otherwise). Revalidates `/`.
- `setDayStickerAction(day, sticker | null)`: day must equal `today()`
  (`{ ok: false, reason: "day-ended" }` otherwise), sticker must be in
  `STICKERS` or `null` (clears). Revalidates `/`.

## Data loading

`loadDay` in `page.tsx` also loads, for the owner only: the day's sticker, the
month's stickers, and keeps message days and answer days separate (the dock
colours them differently). Visitors get none of the check-in data, as before.

## Room for AI (not built)

- Cloud: empty sticker/tape slot.
- Weather: `mindWeather` is the single input point.
- Forecast page: a future `/reflect` link goes in the header; nothing rendered
  today.
- Chat: a future right-side drawer; needs nothing today.

## Testing

Vitest, matching the existing tests:

- `lib/weather.test.ts`: thresholds.
- `lib/clouds.test.ts`: `cloudSize` buckets, `cloudJitter` is deterministic and
  in range.
- `lib/days.test.ts`: `shiftDay` across month and year edges.
- `lib/day-keys.test.ts`: key mapping (including ignored targets and
  modifiers) and swipe thresholds.
- `checkin-actions.test.ts`: `moveNoteAction` (auth, validation, clamping,
  past days allowed) and `setDayStickerAction` (auth, today only, unknown
  sticker rejected, `null` clears).

Then a manual run in the browser: both themes and calm-at-night, desktop and
phone widths, visitor vs owner, reduced motion on.

## Out of scope

AI analysis, the forecast page, the chat drawer, draggable clouds, custom
stickers, and changing past check-ins.

## Before going live

Run `npm run db:init` against prod before deploying (new columns and table).
