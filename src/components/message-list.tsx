import { DeleteMessageButton } from "@/components/delete-message-button";
import { optionalEnv } from "@/lib/env";
import type { Message, MessageSource } from "@/lib/messages";

function resolveTimeZone(): string {
  const configured = optionalEnv("DISPLAY_TIME_ZONE", "UTC");
  try {
    new Date().toLocaleString("en-US", { timeZone: configured });
    return configured;
  } catch {
    console.error(
      `Invalid DISPLAY_TIME_ZONE ${JSON.stringify(configured)}; falling back to UTC`,
    );
    return "UTC";
  }
}

// Resolved once at module scope: the zone can't change between renders, and
// validating inside the per-message map would repeat the work for every row.
const TIME_ZONE = resolveTimeZone();

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const SOURCE_LABELS: Record<MessageSource, string> = {
  telegram: "Telegram",
  web: "web",
};

export function MessageList({
  messages,
  canDelete,
}: {
  messages: Message[];
  canDelete: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {messages.map((message) => (
        <li
          key={message.id}
          className="rounded-xl border border-[var(--border)] bg-card px-5 py-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-1.5 text-[13px] font-medium text-[var(--text-muted)]">
              <time dateTime={message.sentAt.toISOString()}>
                {formatTimestamp(message.sentAt)}
              </time>
              <span>· via {SOURCE_LABELS[message.source]}</span>
            </div>
            {canDelete && <DeleteMessageButton id={message.id} />}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {message.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
