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
