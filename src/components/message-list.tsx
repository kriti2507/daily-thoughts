import { DeleteMessageButton } from "@/components/delete-message-button";
import { TIME_ZONE } from "@/lib/days";
import type { Message, MessageSource } from "@/lib/messages";

// The list now shows a single day under a date heading, so only the time is
// needed here.
function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
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
