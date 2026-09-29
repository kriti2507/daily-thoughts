# Write on the Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin write journal entries from the browser into the same `messages` table as Telegram, so both show up in one timeline.

**Architecture:** A `source` column (`telegram` / `web`) is added to `messages` in place. A new admin-gated server action inserts web rows. A "New entry" button in the sticky header opens a native `<dialog>` with the compose form, which leaves the main area and the bottom of the screen free for a future chat box and analysis views.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Postgres via `postgres`, Tailwind v4, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-write-on-the-page-design.md`

**Conventions:**
- Branch: `feat/write-on-page` (already created). Commit after each task; **never push**.
- `git commit` needs the sandbox disabled because of GPG signing.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The sandbox can't read `.env`, so the user runs `npm run db:init` themselves.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `db/schema.sql` | Modify | Add `source`; make Telegram ids nullable |
| `src/lib/messages.ts` | Modify | `source` on `Message`; `insertWebMessage` |
| `src/app/actions.ts` | Modify | `createMessageAction` (admin gate + validation) |
| `src/app/actions.test.ts` | Modify | Tests for `createMessageAction` |
| `src/components/compose-dialog.tsx` | Create | Header button + `<dialog>` compose form |
| `src/app/layout.tsx` | Modify | Render `ComposeDialog` for the admin |
| `src/components/message-list.tsx` | Modify | "via web / via Telegram" label |
| `src/app/page.tsx` | Modify | Empty-state copy |
| `README.md` | Modify | Document writing from the page |

---

### Task 1: Schema and data layer

**Files:**
- Modify: `db/schema.sql`
- Modify: `src/lib/messages.ts`

There are no unit tests for `messages.ts` because it is a thin SQL layer and the repo doesn't test it. Verification is the type check plus the existing suite.

- [ ] **Step 1: Append the migration to `db/schema.sql`**

Add after the existing `CREATE INDEX` line:

```sql

-- Web entries have no Telegram ids; `source` tells the two inputs apart.
-- Idempotent, so `npm run db:init` upgrades an existing table in place.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'telegram'
  CHECK (source IN ('telegram', 'web'));
ALTER TABLE messages ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN chat_id DROP NOT NULL;
```

- [ ] **Step 2: Replace `src/lib/messages.ts` with:**

```ts
import { getSql } from "@/lib/db";

export type MessageSource = "telegram" | "web";

export interface Message {
  id: number;
  text: string;
  sentAt: Date;
  source: MessageSource;
}

export interface NewMessage {
  telegramId: number;
  chatId: number;
  text: string;
  sentAt: Date;
}

export async function insertMessage(message: NewMessage): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO messages (source, telegram_id, chat_id, text, sent_at)
    VALUES ('telegram', ${message.telegramId}, ${message.chatId}, ${message.text}, ${message.sentAt})
    ON CONFLICT (chat_id, telegram_id) DO NOTHING
  `;
}

export async function insertWebMessage(text: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO messages (source, text, sent_at)
    VALUES ('web', ${text}, now())
  `;
}

export async function deleteMessage(id: number): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM messages WHERE id = ${id}`;
}

export async function listMessages(limit: number): Promise<Message[]> {
  const sql = getSql();
  const rows = await sql<
    { id: string; text: string; sent_at: Date; source: MessageSource }[]
  >`
    SELECT id, text, sent_at, source
    FROM messages
    ORDER BY sent_at DESC, id DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    text: row.text,
    sentAt: row.sent_at,
    source: row.source,
  }));
}
```

- [ ] **Step 3: Type-check and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass (the webhook tests mock `insertMessage`, whose signature is unchanged).

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql src/lib/messages.ts
git commit -m "feat: add source column so web and telegram entries share one table"
```

- [ ] **Step 5: Ask the user to apply the migration**

Tell the user to run `! npm run db:init` (it reads `.env`, which the sandbox can't read).
Expected output: `schema applied`. Running it a second time is also safe.

---

### Task 2: `createMessageAction`

**Files:**
- Modify: `src/app/actions.test.ts`
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/actions.test.ts`, change the messages mock and imports:

```ts
vi.mock("@/lib/messages", () => ({
  deleteMessage: vi.fn(),
  insertWebMessage: vi.fn(),
}));
```

```ts
import { createMessageAction, deleteMessageAction } from "@/app/actions";
import { isAdmin } from "@/lib/admin";
import { deleteMessage, insertWebMessage } from "@/lib/messages";
```

Add `vi.mocked(insertWebMessage).mockClear();` inside the existing `afterEach`.

Append this block at the end of the file:

```ts
describe("createMessageAction", () => {
  it("stores the trimmed text and refreshes the page for an admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await createMessageAction("  a thought\n");

    expect(insertWebMessage).toHaveBeenCalledWith("a thought");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses a non-admin", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);

    await expect(createMessageAction("a thought")).rejects.toThrow("unauthorized");
    expect(insertWebMessage).not.toHaveBeenCalled();
  });

  it("refuses text that is empty, blank, too long, or not a string", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    for (const text of ["", "   \n", "x".repeat(4097), 7 as unknown as string]) {
      await expect(createMessageAction(text)).rejects.toThrow("invalid message");
    }
    expect(insertWebMessage).not.toHaveBeenCalled();
  });

  it("accepts text at exactly the length limit", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);

    await createMessageAction("x".repeat(4096));

    expect(insertWebMessage).toHaveBeenCalledWith("x".repeat(4096));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/actions.test.ts`
Expected: the `createMessageAction` tests FAIL because `createMessageAction` is not a function. The `deleteMessageAction` tests still pass.

- [ ] **Step 3: Implement the action**

In `src/app/actions.ts`, change the messages import to:

```ts
import { deleteMessage, insertWebMessage } from "@/lib/messages";
```

Add below the imports. It must stay unexported, because a `"use server"` file may only export async functions:

```ts
// Telegram's own cap, so an entry is the same size whichever way it arrives.
const MAX_MESSAGE_LENGTH = 4096;
```

Append at the end of the file:

```ts
export async function createMessageAction(text: string): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("unauthorized");
  }
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error("invalid message");
  }

  await insertWebMessage(trimmed);
  revalidatePath("/");
}
```

The existing comment above `deleteMessageAction` ("Server actions are public endpoints…") covers both actions, so leave it where it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts src/app/actions.test.ts
git commit -m "feat: admin-only server action to save an entry from the page"
```

---

### Task 3: Compose dialog, source label, docs

**Files:**
- Create: `src/components/compose-dialog.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/message-list.tsx`
- Modify: `src/app/page.tsx`
- Modify: `README.md`

Vitest runs in the `node` environment with no DOM, and the repo has no component tests. Verify these UI changes manually (Step 7).

- [ ] **Step 1: Create `src/components/compose-dialog.tsx`**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { PenLine } from "lucide-react";

import { createMessageAction } from "@/app/actions";

// Lives in the header and opens a modal so the page itself stays free for
// whatever comes next (chat, analysis) instead of reserving space for a form.
export function ComposeDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const canSave = text.trim().length > 0 && !isPending;

  function open() {
    dialogRef.current?.showModal();
    textareaRef.current?.focus();
  }

  function close() {
    dialogRef.current?.close();
  }

  function save() {
    if (!canSave) {
      return;
    }
    startTransition(async () => {
      try {
        await createMessageAction(text);
        setText("");
        close();
      } catch (error) {
        // Keep the draft: nothing typed should be lost to a failed save.
        console.error("failed to save entry", error);
        window.alert("Couldn't save the entry.");
      }
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-[10px] bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-terracotta)] px-3 text-[13px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all duration-200 hover:shadow-[var(--shadow-md)]"
      >
        <PenLine className="h-4 w-4" strokeWidth={2} />
        <span className="hidden sm:inline">New entry</span>
        <span className="sr-only sm:hidden">New entry</span>
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(560px,calc(100%-2rem))] rounded-xl border border-[var(--border)] bg-card p-5 text-foreground shadow-[var(--shadow-md)] backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-bold">New entry</h2>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={6}
            placeholder="What's on your mind?"
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-[var(--border-strong)]"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[12px] text-[var(--text-muted)]">
              ⌘/Ctrl + Enter to save
            </span>
            <button
              type="button"
              onClick={close}
              className="h-8 cursor-pointer rounded-md px-3 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--border)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="h-8 cursor-pointer rounded-md bg-foreground px-3 text-[13px] font-semibold text-[var(--background)] transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
```

Notes for the implementer:
- `showModal()` puts the dialog in the browser's top layer, so the header's `backdrop-blur` (which would otherwise trap `position: fixed` children) doesn't affect it.
- Esc closes the dialog natively and keeps the draft, which is intended.

- [ ] **Step 2: Render it in the header (`src/app/layout.tsx`)**

Add imports:

```ts
import { ComposeDialog } from "@/components/compose-dialog";
import { isAdmin } from "@/lib/admin";
```

Make the layout async and check admin once:

```tsx
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const canWrite = await isAdmin();

  return (
```

Replace the right-hand header group with:

```tsx
            <div className="flex items-center gap-4">
              <HeaderDate />
              {canWrite && <ComposeDialog />}
              <ThemeToggle />
            </div>
```

- [ ] **Step 3: Add the source label (`src/components/message-list.tsx`)**

Change the type import to:

```ts
import type { Message, MessageSource } from "@/lib/messages";
```

Add below `formatTimestamp`:

```ts
const SOURCE_LABELS: Record<MessageSource, string> = {
  telegram: "Telegram",
  web: "web",
};
```

Replace the `<time>…</time>` element with:

```tsx
            <div className="flex items-baseline gap-1.5 text-[13px] font-medium text-[var(--text-muted)]">
              <time dateTime={message.sentAt.toISOString()}>
                {formatTimestamp(message.sentAt)}
              </time>
              <span>· via {SOURCE_LABELS[message.source]}</span>
            </div>
```

- [ ] **Step 4: Update the empty state (`src/app/page.tsx`)**

Replace:

```tsx
        <Notice>Nothing here yet — send your bot a message on Telegram.</Notice>
```

with:

```tsx
        <Notice>
          Nothing here yet — send your bot a message on Telegram, or write one
          here.
        </Notice>
```

- [ ] **Step 5: Update `README.md`**

Change the tagline line to:

```markdown
Write a message to your Telegram bot, or on the page itself; it shows up on your page.
```

Rename the `## Deleting messages` heading to `## Writing and deleting from the page`, and replace its paragraph with:

```markdown
Set `ADMIN_SECRET` (e.g. `openssl rand -hex 32`), then visit
`/admin?key=<ADMIN_SECRET>` once in your browser. That sets a cookie, and with
it a **New entry** button appears in the header and a delete button on each
message. Entries written on the page are stored alongside Telegram ones and
labelled "via web". Deleting removes the row from Postgres permanently. Without
the cookie the page stays read-only; with `ADMIN_SECRET` unset, both are off
entirely. Rotating the secret signs out every browser.
```

In the Configuration table, change the `ADMIN_SECRET` row to:

```markdown
| `ADMIN_SECRET` | no | Enables writing and deleting from the page. See [Writing and deleting from the page](#writing-and-deleting-from-the-page). |
```

- [ ] **Step 6: Type-check, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no errors; all tests pass.

- [ ] **Step 7: Manual check (user runs the app; the sandbox may block port binding)**

1. `npm run dev`, open `http://localhost:3000`. You should see no New entry button.
2. Visit `/admin?key=<ADMIN_SECRET>`. The **New entry** button should appear in the header.
3. Click it. The dialog opens with the textarea focused, and Save is disabled while the textarea is empty.
4. Type something and press ⌘+Enter. The dialog closes and the entry appears at the top, labelled "via web".
5. Send the bot a Telegram message (or use the curl in the README). It should appear in the same list, labelled "via Telegram".
6. Open the dialog, type, and press Esc. Reopen it: the draft is still there.
7. Toggle dark mode and check the dialog and button still read well.

- [ ] **Step 8: Commit**

```bash
git add src/components/compose-dialog.tsx src/app/layout.tsx src/components/message-list.tsx src/app/page.tsx README.md
git commit -m "feat: write entries from a header compose dialog, label each entry's source"
```
