import type { ReactNode } from "react";

import { MessageList } from "@/components/message-list";
import { isAdmin } from "@/lib/admin";
import { listMessages } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Silently truncates: messages beyond the most recent 100 simply aren't
// shown. There is deliberately no pagination in this base layer.
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

  const canDelete = await isAdmin();

  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      {messages === null ? (
        <Notice>
          Couldn&apos;t reach the database. Check <code>DATABASE_URL</code>.
        </Notice>
      ) : messages.length === 0 ? (
        <Notice>Nothing here yet — send your bot a message on Telegram.</Notice>
      ) : (
        <MessageList messages={messages} canDelete={canDelete} />
      )}
    </div>
  );
}
