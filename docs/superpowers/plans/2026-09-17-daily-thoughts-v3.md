# Daily Thoughts v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the project to one pipeline — you write a Telegram message, it appears on the main page — by deleting the Python cron/LLM/goals pipeline and replacing it with a Next.js webhook route backed by Postgres.

**Architecture:** A single Next.js app at the repository root, deployed to Vercel. Telegram POSTs each update to `/api/telegram/webhook`, which verifies a shared secret, filters to the owner's chat, and inserts the message into Postgres. The main page server-renders the most recent messages as a flat list, newest first. There is no background process and no scheduled job.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Tailwind CSS v4, Postgres via `postgres` (postgres.js), Vitest, Node 20.

**Spec:** `docs/superpowers/specs/2026-09-17-daily-thoughts-v3-design.md`

**Commit discipline:** Commit at the end of every task. Never push — the user handles that.

> **Note on `git commit`:** Commits in this repo are GPG-signed, which fails inside the command sandbox (`gpg: can't connect to the keyboxd: Operation not permitted`). Run every `git commit` with `dangerouslyDisableSandbox: true`.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `db/schema.sql` | The single `messages` table plus its index. Applied by `npm run db:init`. |
| `scripts/db-init.mjs` | Reads `db/schema.sql` and executes it against `DATABASE_URL`. |
| `scripts/set-webhook.mjs` | Registers the webhook URL + secret with Telegram via `setWebhook`. |
| `vitest.config.ts` | Vitest config: node environment, `@/*` path alias. |
| `src/lib/env.ts` | Reads environment variables. Throws a named error when a required one is missing. |
| `src/lib/env.test.ts` | Tests for `env.ts`. |
| `src/lib/db.ts` | Owns the Postgres client. Caches one connection across warm invocations. |
| `src/lib/messages.ts` | The only module containing SQL: `insertMessage`, `listMessages`. |
| `src/app/api/telegram/webhook/route.ts` | The webhook handler: validate → filter → insert → `200`. |
| `src/app/api/telegram/webhook/route.test.ts` | Tests for the handler's four paths. |
| `src/components/message-list.tsx` | Renders an array of messages as a flat list. |

### Moved (`frontend/` → repository root)

`src/`, `public/`, `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`.

### Modified

| Path | Change |
|---|---|
| `next.config.ts` | Delete the `/api/:path*` → `localhost:8000` rewrite. Without this the webhook route is unreachable. |
| `package.json` | Drop `recharts`, `@base-ui/react`, `class-variance-authority`. Add `postgres`, `vitest`. Move `shadcn` to `devDependencies`. Add `test`, `db:init`, `webhook:set` scripts. |
| `.gitignore` | Merge `frontend/.gitignore` in, drop the Python sections, un-ignore `.env.example`. |
| `src/app/page.tsx` | Replace the six-card dashboard with the flat message list. |
| `README.md`, `manual.md` | Rewrite: no venv, no cron, no `sqlite3`, no reply-to-message interaction. |

### Deleted

`src/` (Python: `main.py`, `llm.py`, `goals.py`, `telegram.py`, `db.py`, `config.py`, `__init__.py`), `api/`, `tests/`, `requirements.txt`, `goals.md`, `frontend/README.md`, `src/components/dashboard/` (6 files), `src/lib/api.ts`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`, `src/components/ui/progress.tsx`, `src/components/ui/card.tsx`.

> **Why all four UI components go:** a grep of `frontend/src` shows none of `ui/badge`, `ui/button`, `ui/progress`, or `ui/card` is imported anywhere. They are dead code today. The message list uses plain elements styled with the existing CSS variables, so nothing needs them.

### Kept unchanged

`src/app/layout.tsx` (header shell, fonts, theme provider), `src/app/globals.css` (the warm/amber palette and its dark variant), `src/components/theme-provider.tsx`, `src/components/theme-toggle.tsx`, `src/lib/utils.ts`, `src/app/favicon.ico`, `public/`.

---

## Task 1: Delete the Python pipeline and move the app to the repository root

Nothing in `src/` (Python), `api/`, or `tests/` survives v3. Once they are gone, `frontend/` is the whole project, so it moves up to the root and Vercel needs no Root Directory setting.

**Files:**
- Delete: `src/config.py`, `src/db.py`, `src/goals.py`, `src/llm.py`, `src/main.py`, `src/telegram.py`, `src/__init__.py`
- Delete: `api/server.py`, `api/test_server.py`, `api/requirements.txt`
- Delete: `tests/__init__.py`, `tests/test_config.py`, `tests/test_db.py`, `tests/test_goals.py`, `tests/test_llm.py`, `tests/test_telegram.py`
- Delete: `requirements.txt`, `goals.md`, `frontend/README.md`
- Move: `frontend/*` → repository root
- Modify: `.gitignore`

- [ ] **Step 1: Delete the Python tree**

```bash
git rm -r -q src api tests requirements.txt goals.md frontend/README.md
```

- [ ] **Step 2: Move the Next.js app to the root**

The Python `src/` must already be deleted (Step 1) for `frontend/src` to move into `src`.

```bash
git mv frontend/src src
git mv frontend/public public
for f in package.json package-lock.json tsconfig.json next.config.ts \
         eslint.config.mjs postcss.config.mjs components.json; do
  git mv "frontend/$f" "$f"
done
git rm -q frontend/.gitignore
rmdir frontend 2>/dev/null || true
```

- [ ] **Step 3: Write the merged root `.gitignore`**

The Python sections go. `frontend/.gitignore`'s `.env*` line is merged in, but `.env.example` is negated — it is documentation and must stay tracked.

```gitignore
# dependencies
/node_modules
/.pnp
.pnp.*

# next.js
/.next/
/out/
/build

# testing
/coverage

# env files
.env*
!.env.example

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# misc
.DS_Store
*.pem
npm-debug.log*
```

- [ ] **Step 4: Verify the tree looks right**

Run: `git status --short && ls`
Expected: the root contains `src`, `public`, `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `docs`, `LICENSE`, `README.md`, `manual.md`. Gone: `frontend`, `api`, `tests`, `requirements.txt`, `goals.md`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor!: delete Python pipeline, move Next.js app to repo root"
```

---

## Task 2: Remove the dashboard and the dead FastAPI proxy

The six dashboard cards all render categorization data that no longer exists, and `lib/api.ts` fetches endpoints that no longer exist. The `next.config.ts` rewrite is the load-bearing deletion here: it proxies every `/api/*` request to `localhost:8000`, which would intercept the webhook route added in Task 7.

**Files:**
- Delete: `src/components/dashboard/goal-clarity.tsx`, `mood-chart.tsx`, `recent-entries.tsx`, `streak.tsx`, `today-mood.tsx`, `weekly-mood.tsx`
- Delete: `src/lib/api.ts`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`, `src/components/ui/progress.tsx`, `src/components/ui/card.tsx`
- Modify: `next.config.ts`, `src/app/page.tsx`, `package.json`

- [ ] **Step 1: Delete the dashboard, the API client, and the dead UI components**

```bash
git rm -r -q src/components/dashboard
git rm -q src/lib/api.ts \
           src/components/ui/badge.tsx \
           src/components/ui/button.tsx \
           src/components/ui/progress.tsx \
           src/components/ui/card.tsx
rmdir src/components/ui 2>/dev/null || true
```

- [ ] **Step 2: Strip the rewrite from `next.config.ts`**

Replace the entire file with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 3: Replace `src/app/page.tsx` with a stub**

Task 8 replaces this with the database-backed version. For now it just has to compile and render, so the commit stays green.

```tsx
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      <p className="text-[15px] text-[var(--text-secondary)]">
        Nothing here yet.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Drop the newly-unused dependencies**

`recharts` was imported only by `mood-chart.tsx`; `@base-ui/react` and `class-variance-authority` only by the deleted UI components. `shadcn` is a scaffolding CLI that is never imported, so it belongs in `devDependencies` rather than being installed on every Vercel build.

```bash
npm uninstall recharts @base-ui/react class-variance-authority shadcn
npm install --save-dev shadcn
```

- [ ] **Step 5: Verify nothing still imports a deleted module**

Run: `grep -rn "recharts\|@base-ui/react\|class-variance-authority\|lib/api\|components/dashboard\|ui/card\|ui/badge\|ui/button\|ui/progress" src`
Expected: no output.

- [ ] **Step 6: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds. The route list shows `/` and no `/api/*` routes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor!: remove dashboard, API client, and FastAPI proxy rewrite"
```

---

## Task 3: Add the Postgres schema and its init script

**Files:**
- Create: `db/schema.sql`, `scripts/db-init.mjs`
- Modify: `package.json`

- [ ] **Step 1: Install the Postgres client**

```bash
npm install postgres
```

- [ ] **Step 2: Write `db/schema.sql`**

`UNIQUE (chat_id, telegram_id)` is what makes Telegram's webhook retries idempotent — see Task 7.

```sql
CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL    PRIMARY KEY,
  telegram_id BIGINT       NOT NULL,
  chat_id     BIGINT       NOT NULL,
  text        TEXT         NOT NULL,
  sent_at     TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS messages_sent_at_idx ON messages (sent_at DESC);
```

- [ ] **Step 3: Write `scripts/db-init.mjs`**

Plain `.mjs`, not TypeScript, so `node` runs it with no build step. `.simple()` is required because postgres.js otherwise sends one prepared statement at a time and `schema.sql` contains two statements.

```js
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.");
  process.exit(1);
}

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql.unsafe(schema).simple();
  console.log("schema applied");
} catch (error) {
  console.error("failed to apply schema:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
```

- [ ] **Step 4: Add the `db:init` script to `package.json`**

`--env-file` is native in Node 20.6+, so no `dotenv` dependency is needed.

```json
"db:init": "node --env-file=.env scripts/db-init.mjs"
```

- [ ] **Step 5: Verify the script fails cleanly without configuration**

Run: `node scripts/db-init.mjs`
Expected: prints `DATABASE_URL is not set. Add it to .env.` and exits non-zero.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add messages table schema and db:init script"
```

---

## Task 4: Environment variable accessor

The handler needs its secret and chat id, and both must fail loudly when unset rather than silently matching `undefined`. Reading them through a function rather than at module load is what lets the Task 7 tests stub them.

**Files:**
- Create: `src/lib/env.ts`, `vitest.config.ts`
- Test: `src/lib/env.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest and configure it**

```bash
npm install --save-dev vitest
```

Create `vitest.config.ts`. The alias mirrors the `@/*` path in `tsconfig.json`, which Vitest does not read on its own.

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/env.test.ts`. Vitest globals are not enabled, so the helpers are imported explicitly.

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { optionalEnv, requireEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv("SOME_KEY", "some-value");
    expect(requireEnv("SOME_KEY")).toBe("some-value");
  });

  it("throws a named error when unset", () => {
    vi.stubEnv("SOME_KEY", undefined);
    expect(() => requireEnv("SOME_KEY")).toThrow(
      "Missing required environment variable: SOME_KEY",
    );
  });

  it("treats an empty string as unset", () => {
    vi.stubEnv("SOME_KEY", "");
    expect(() => requireEnv("SOME_KEY")).toThrow(
      "Missing required environment variable: SOME_KEY",
    );
  });
});

describe("optionalEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv("SOME_KEY", "some-value");
    expect(optionalEnv("SOME_KEY", "fallback")).toBe("some-value");
  });

  it("returns the fallback when unset", () => {
    vi.stubEnv("SOME_KEY", undefined);
    expect(optionalEnv("SOME_KEY", "fallback")).toBe("fallback");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/lib/env.test.ts`
Expected: FAIL — cannot resolve `@/lib/env`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/env.ts`:

```ts
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/env.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add env accessors with vitest setup"
```

---

## Task 5: Postgres client module

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Write the implementation**

There is no unit test here: the module's only behaviour is connecting to a real database, which the Task 6 and 7 tests mock out at the `messages.ts` boundary instead.

The `globalThis` cache matters twice over — it survives Next's dev-mode hot reload, and it stops a warm Vercel function from opening a new connection per request. `max: 1` suits serverless, where each instance handles one request at a time. `prepare: false` is required by transaction-mode poolers such as Supabase's and PgBouncer's, and is harmless everywhere else.

```ts
import postgres from "postgres";

import { requireEnv } from "@/lib/env";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as typeof globalThis & { __sql?: Sql };

export function getSql(): Sql {
  if (!globalForDb.__sql) {
    globalForDb.__sql = postgres(requireEnv("DATABASE_URL"), {
      max: 1,
      prepare: false,
    });
  }
  return globalForDb.__sql;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add cached postgres client"
```

---

## Task 6: Messages module

The only module that writes SQL. Keeping both queries here means the route handler and the page never build SQL, and the webhook tests have exactly one module to mock.

**Files:**
- Create: `src/lib/messages.ts`

- [ ] **Step 1: Write the implementation**

`id` is a `BIGSERIAL`, which postgres.js returns as a string to avoid precision loss; it is converted to a number for the React `key`. `sent_at` is a `TIMESTAMPTZ` and comes back as a `Date`.

```ts
import { getSql } from "@/lib/db";

export interface Message {
  id: number;
  text: string;
  sentAt: Date;
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
    INSERT INTO messages (telegram_id, chat_id, text, sent_at)
    VALUES (${message.telegramId}, ${message.chatId}, ${message.text}, ${message.sentAt})
    ON CONFLICT (chat_id, telegram_id) DO NOTHING
  `;
}

export async function listMessages(limit: number): Promise<Message[]> {
  const sql = getSql();
  const rows = await sql<{ id: string; text: string; sent_at: Date }[]>`
    SELECT id, text, sent_at
    FROM messages
    ORDER BY sent_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    text: row.text,
    sentAt: row.sent_at,
  }));
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add message insert and list queries"
```

---

## Task 7: Telegram webhook route

The endpoint is publicly reachable, so the secret header is the only thing proving the caller is Telegram. Every non-authentication rejection returns `200`: Telegram redelivers any update it does not get a `2xx` for, so a `4xx` on a message we intend to drop would make it retry that update indefinitely.

**Files:**
- Create: `src/app/api/telegram/webhook/route.ts`
- Test: `src/app/api/telegram/webhook/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/telegram/webhook/route.test.ts`. `src/lib/messages` is mocked so no database is needed.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/messages", () => ({
  insertMessage: vi.fn(),
}));

import { insertMessage } from "@/lib/messages";
import { POST } from "@/app/api/telegram/webhook/route";

const SECRET = "test-secret";
const OWNER_CHAT_ID = 4242;

function buildRequest(body: unknown, secret: string | null = SECRET): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) {
    headers["x-telegram-bot-api-secret-token"] = secret;
  }
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function textUpdate(overrides: Record<string, unknown> = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 99,
      date: 1_757_000_000,
      text: "a thought",
      chat: { id: OWNER_CHAT_ID },
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("TELEGRAM_CHAT_ID", String(OWNER_CHAT_ID));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(insertMessage).mockClear();
});

describe("POST /api/telegram/webhook", () => {
  it("rejects a request with the wrong secret", async () => {
    const response = await POST(buildRequest(textUpdate(), "wrong-secret"));

    expect(response.status).toBe(401);
    expect(insertMessage).not.toHaveBeenCalled();
  });

  it("rejects a request with no secret header", async () => {
    const response = await POST(buildRequest(textUpdate(), null));

    expect(response.status).toBe(401);
    expect(insertMessage).not.toHaveBeenCalled();
  });

  it("ignores a message from another chat", async () => {
    const response = await POST(buildRequest(textUpdate({ chat: { id: 1 } })));

    expect(response.status).toBe(200);
    expect(insertMessage).not.toHaveBeenCalled();
  });

  it("ignores an update with no message text", async () => {
    const response = await POST(buildRequest(textUpdate({ text: undefined })));

    expect(response.status).toBe(200);
    expect(insertMessage).not.toHaveBeenCalled();
  });

  it("stores a valid message, converting the unix date", async () => {
    const response = await POST(buildRequest(textUpdate()));

    expect(response.status).toBe(200);
    expect(insertMessage).toHaveBeenCalledWith({
      telegramId: 99,
      chatId: OWNER_CHAT_ID,
      text: "a thought",
      sentAt: new Date(1_757_000_000 * 1000),
    });
  });

  it("returns 200 when the insert fails, so Telegram does not retry forever", async () => {
    vi.mocked(insertMessage).mockRejectedValueOnce(new Error("db unreachable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(buildRequest(textUpdate()));

    expect(response.status).toBe(200);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/api/telegram/webhook/route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/telegram/webhook/route`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/telegram/webhook/route.ts`.

Note the `chatId` local: comparing `message.chat?.id` inline would not narrow `chat` to defined for TypeScript, so the id is extracted first and compared as a value.

```ts
import { requireEnv } from "@/lib/env";
import { insertMessage } from "@/lib/messages";

interface TelegramUpdate {
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    chat?: { id?: number };
  };
}

/**
 * Ignored updates must still answer 200 — Telegram redelivers any update it
 * does not receive a 2xx for, so a 4xx here means an unwanted message is
 * retried forever.
 */
function ok(): Response {
  return new Response("ok", { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== requireEnv("TELEGRAM_WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return ok();
  }

  const message = update.message;
  if (!message || typeof message.text !== "string" || message.text.length === 0) {
    return ok();
  }

  const chatId = message.chat?.id;
  if (chatId !== Number(requireEnv("TELEGRAM_CHAT_ID"))) {
    return ok();
  }

  if (typeof message.message_id !== "number" || typeof message.date !== "number") {
    return ok();
  }

  try {
    await insertMessage({
      telegramId: message.message_id,
      chatId,
      text: message.text,
      sentAt: new Date(message.date * 1000),
    });
  } catch (error) {
    // Losing one message beats unbounded Telegram retries against a down database.
    console.error("failed to store telegram message", error);
  }

  return ok();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/app/api/telegram/webhook/route.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 11 tests across 2 files.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add telegram webhook route with secret and chat filtering"
```

---

## Task 8: Render the messages on the main page

**Files:**
- Create: `src/components/message-list.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the message list component**

Create `src/components/message-list.tsx`.

Timestamps are formatted server-side in `DISPLAY_TIME_ZONE` (default `UTC`), because a Vercel function's clock is UTC and formatting in the server's local zone would show the wrong time. Setting that variable to e.g. `Asia/Tokyo` in `.env` is the one-line fix; moving formatting to the browser's own locale is a sensible later change.

```tsx
import { optionalEnv } from "@/lib/env";
import type { Message } from "@/lib/messages";

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: optionalEnv("DISPLAY_TIME_ZONE", "UTC"),
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {messages.map((message) => (
        <li
          key={message.id}
          className="rounded-xl border border-[var(--border)] bg-card px-5 py-4"
        >
          <time
            dateTime={message.sentAt.toISOString()}
            className="text-[13px] font-medium text-[var(--text-muted)]"
          >
            {formatTimestamp(message.sentAt)}
          </time>
          <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {message.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Rewrite `src/app/page.tsx`**

`force-dynamic` keeps the page from serving a cached render after a new message arrives. The database-error state is worded differently from the empty state so a connection failure is not mistaken for "no messages yet".

`ReactNode` is imported explicitly rather than reached through a global `React` namespace, which is not available under this `tsconfig.json`.

```tsx
import type { ReactNode } from "react";

import { MessageList } from "@/components/message-list";
import { listMessages } from "@/lib/messages";

export const dynamic = "force-dynamic";

const MESSAGE_LIMIT = 100;

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="text-[15px] text-[var(--text-secondary)]">{children}</p>
  );
}

export default async function HomePage() {
  let messages: Awaited<ReturnType<typeof listMessages>> | null = null;

  try {
    messages = await listMessages(MESSAGE_LIMIT);
  } catch (error) {
    console.error("failed to load messages", error);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      {messages === null ? (
        <Notice>
          Couldn&apos;t reach the database. Check <code>DATABASE_URL</code>.
        </Notice>
      ) : messages.length === 0 ? (
        <Notice>Nothing here yet — send your bot a message on Telegram.</Notice>
      ) : (
        <MessageList messages={messages} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: build succeeds; route list shows `/` as dynamic (`ƒ`) and `/api/telegram/webhook`.

- [ ] **Step 4: Verify the error state renders rather than crashing**

With no `DATABASE_URL` set, start the dev server in the background, wait for it to listen, then request the page:

```bash
npm run dev &
sleep 5
curl -s localhost:3000 | grep -o "Couldn.t reach the database"
kill %1
```

Expected: the phrase is found — the page renders the error state rather than a stack trace.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: render telegram messages as a flat list on the main page"
```

---

## Task 9: Webhook registration script

**Files:**
- Create: `scripts/set-webhook.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

No imports are needed — `fetch`, `process`, and `URL` are all global in Node 20.

```js
const url = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!url) {
  console.error("usage: npm run webhook:set -- https://your-app.vercel.app");
  process.exit(1);
}
if (!token || !secret) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set in .env");
  process.exit(1);
}

const response = await fetch(
  `https://api.telegram.org/bot${token}/setWebhook`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: new URL("/api/telegram/webhook", url).toString(),
      secret_token: secret,
      allowed_updates: ["message"],
    }),
  },
);

const body = await response.json();
if (!body.ok) {
  console.error("setWebhook failed:", body.description);
  process.exitCode = 1;
} else {
  console.log("webhook registered:", new URL("/api/telegram/webhook", url).toString());
}
```

`allowed_updates: ["message"]` tells Telegram not to bother sending edits, channel posts, or callback queries — the handler would drop them anyway.

- [ ] **Step 2: Add the script to `package.json`**

```json
"webhook:set": "node --env-file=.env scripts/set-webhook.mjs"
```

- [ ] **Step 3: Verify it fails cleanly with no argument**

Run: `node scripts/set-webhook.mjs`
Expected: prints the usage line and exits non-zero.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add webhook:set script for telegram registration"
```

---

## Task 10: Rewrite the documentation

`README.md` and `manual.md` currently document a venv, a crontab, `REPLY_TIMEOUT_SECONDS`, tap-and-hold replies, and `sqlite3` inspection — none of which exist in v3. `manual.md` also hardcodes a path from a different machine.

**Files:**
- Modify: `README.md`, `manual.md`

- [ ] **Step 1: Rewrite `README.md`**

```markdown
# daily-thoughts

Write a message to your Telegram bot; it shows up on your page.

Telegram POSTs each message to a Next.js route, which stores it in Postgres.
The main page reads Postgres. No cron, no polling, no background process.

## Setup

1. Create a bot with [@BotFather](https://t.me/botfather) and copy the token.
2. Message the bot once, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your `chat.id`.
3. Create a Postgres database (Neon, Supabase, or local).
4. Copy `.env.example` to `.env` and fill it in. Generate the webhook secret
   with `openssl rand -hex 32`.
5. Install and initialise:

   ```bash
   npm install
   npm run db:init
   ```

## Running locally

```bash
npm run dev
```

Telegram cannot reach `localhost`, so to exercise the webhook locally either
expose the port (`ngrok http 3000`) and point the webhook at that URL, or POST
an update yourself:

```bash
curl -X POST localhost:3000/api/telegram/webhook \
  -H "content-type: application/json" \
  -H "x-telegram-bot-api-secret-token: $TELEGRAM_WEBHOOK_SECRET" \
  -d '{"message":{"message_id":1,"date":1757000000,"text":"hello","chat":{"id":YOUR_CHAT_ID}}}'
```

## Deploying

Deploy to Vercel, set the four environment variables in the project settings,
then register the webhook against the deployed URL:

```bash
npm run webhook:set -- https://your-app.vercel.app
```

## Tests

```bash
npm test
```

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. |
| `TELEGRAM_BOT_TOKEN` | yes | Used by `webhook:set`. |
| `TELEGRAM_CHAT_ID` | yes | The only chat whose messages are stored. |
| `TELEGRAM_WEBHOOK_SECRET` | yes | Verified on every webhook request. |
| `DISPLAY_TIME_ZONE` | no | IANA zone for timestamps. Defaults to `UTC`. |
```

- [ ] **Step 2: Rewrite `manual.md`**

```markdown
# Manual

Operational notes for daily-thoughts. All commands run from the repository root.

## Checking what Telegram thinks the webhook is

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" | jq
```

`pending_update_count` above zero with a `last_error_message` means Telegram is
retrying against a failing endpoint. `url` should match your deployment.

## Re-pointing the webhook

Vercel preview URLs change per deployment; the production URL does not. After
changing domains:

```bash
npm run webhook:set -- https://your-app.vercel.app
```

## Removing the webhook

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

## Inspecting stored messages

```bash
psql "$DATABASE_URL" -c \
  "SELECT id, sent_at, left(text, 60) FROM messages ORDER BY sent_at DESC LIMIT 10;"
```

## Messages are missing

Work through it in this order:

1. `getWebhookInfo` — is Telegram delivering, and is it reporting an error?
2. Vercel function logs for `/api/telegram/webhook` — a `401` means the secret
   in the Vercel environment does not match the one registered with Telegram.
3. `failed to store telegram message` in the logs — the handler ran but the
   database rejected the write. That message is lost by design; the handler
   returns `200` rather than letting Telegram retry indefinitely.
4. Messages sent from a chat other than `TELEGRAM_CHAT_ID` are dropped
   silently, by design.

## Re-applying the schema

`db/schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS`), so it is safe to
re-run at any time:

```bash
npm run db:init
```
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: rewrite README and manual for the v3 webhook pipeline"
```

---

## Task 11: Final verification

- [ ] **Step 1: Confirm no v2 artefact survives**

Run: `grep -rniE "anthropic|goals\.md|crontab|sqlite|REPLY_TIMEOUT|categoriz|goal1|mood" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=docs .`
Expected: no output. (`docs/` is excluded — the v1/v2 specs and plans are history and stay as they are.)

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS, 11 tests across 2 files.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds. Route list contains exactly `/` (dynamic) and `/api/telegram/webhook`.

- [ ] **Step 5: Confirm the working tree is clean and nothing was pushed**

Run: `git status --short && git log --oneline origin/dev/v1.0..HEAD`
Expected: no uncommitted changes; the log lists the task commits, all local.

---

## Manual step for the user

`.env.example` cannot be edited by the agent — the command sandbox denies access to every path matching `.env*`. Its contents should become:

```bash
# Postgres connection string (Neon, Supabase, RDS, or local)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# From @BotFather
TELEGRAM_BOT_TOKEN=

# Your personal chat id — the only chat whose messages are stored
TELEGRAM_CHAT_ID=

# Shared secret verified on every webhook request: openssl rand -hex 32
TELEGRAM_WEBHOOK_SECRET=

# Optional IANA time zone for displayed timestamps. Defaults to UTC.
DISPLAY_TIME_ZONE=UTC
```

The v2 keys `REPLY_TIMEOUT_SECONDS`, `DB_PATH`, `GOALS_PATH`, `HISTORY_DAYS`,
`LLM_PROVIDER`, `LLM_MODEL`, and `ANTHROPIC_API_KEY` should all be removed from
both `.env.example` and `.env`.
