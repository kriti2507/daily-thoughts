# Write on the Page — Design

**Date:** 2026-09-29
**Status:** Approved

## Summary

Add a way to journal from the browser. Web entries go into the same `messages`
table as Telegram messages, tagged with a `source` column, so both show up in
one timeline, newest first.

**Done when:** an entry written in the browser and one sent via Telegram both
appear in the same list, each labelled with where it came from.

## Constraints

- **Admin-only posting.** Only a visitor holding the admin cookie (set via
  `/admin?key=<ADMIN_SECRET>`, same as delete) sees the compose button, and the
  server action re-checks the cookie.
- **Leave room for later features.** A chat box and analysis views are planned.
  The add button lives in the sticky header and opens a modal, so the main
  content area and the bottom of the screen stay free.

## Data model

Append to `db/schema.sql` (idempotent, so `npm run db:init` upgrades the live
table in place):

```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'telegram'
  CHECK (source IN ('telegram', 'web'));
ALTER TABLE messages ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN chat_id DROP NOT NULL;
```

- Existing rows are backfilled to `'telegram'` by the default.
- Web rows have `telegram_id` and `chat_id` NULL. `UNIQUE (chat_id, telegram_id)`
  still holds for Telegram rows; Postgres treats NULLs as distinct, so web rows
  never conflict.
- Web rows use `sent_at = now()`, so both sources sort on the same column.

## Components

### `src/lib/messages.ts`
- `Message` gains `source: "telegram" | "web"`; `listMessages` selects it.
- `insertMessage` (Telegram) writes `source = 'telegram'` explicitly; signature
  unchanged.
- New `insertWebMessage(text: string)` inserts `('web', text, now())`.

### `src/app/actions.ts`
`createMessageAction(text: string)`:
1. `isAdmin()` or throw `"unauthorized"`.
2. Reject non-strings, empty-after-trim, and length > 4096 (Telegram's limit)
   with `"invalid message"`.
3. `insertWebMessage(text.trim())`, then `revalidatePath("/")`.

### `src/components/compose-dialog.tsx` (client)
- A "New entry" button (pen icon) styled like the theme toggle, plus a native
  `<dialog>` opened with `showModal()`. No new dependency.
- Dialog: textarea (autofocused), Cancel and Save. ⌘/Ctrl+Enter saves; Esc
  closes (native).
- Save runs in `useTransition`; on success it clears and closes the dialog, on
  failure it keeps the text and shows `alert("Couldn't save the entry.")`.
  Save is disabled while pending or when the text is blank.

### `src/app/layout.tsx`
- Becomes `async`; renders `<ComposeDialog />` in the header, before the theme
  toggle, only when `await isAdmin()`.

### `src/components/message-list.tsx`
- Next to the timestamp, a muted `· via web` / `· via Telegram` label.

### `src/app/page.tsx`
- Empty state reads: "Nothing here yet — send your bot a message on Telegram,
  or write one here." (The compose button only shows for the admin, so the
  wording shouldn't assume it's visible.)

## Error handling

- Action failures surface as a client `alert`; the draft is kept so nothing
  typed is lost.
- Database errors on the page load path are unchanged.

## Testing

- `src/app/actions.test.ts`: `createMessageAction` inserts trimmed text and
  revalidates for an admin; refuses a non-admin; refuses empty, whitespace-only,
  over-4096, and non-string input without inserting.
- Existing webhook tests should pass unchanged.
- Manual: run `db:init`, post from the browser and from Telegram, and confirm
  both appear with the right labels.

## Out of scope

Editing entries, markdown, drafts/autosave, optimistic UI, non-admin posting,
backdating entries.
