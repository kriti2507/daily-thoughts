import { ThoughtCloud } from "@/components/thought-cloud";
import { cloudSize } from "@/lib/clouds";
import { TIME_ZONE } from "@/lib/days";
import type { Message, MessageSource } from "@/lib/messages";
import type { MindWeather } from "@/lib/weather";

const SOURCE_LABELS: Record<MessageSource, string> = {
  telegram: "Telegram",
  web: "web",
};

// Formatted here, on the server, where TIME_ZONE is configured.
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Sky({
  messages,
  canDelete,
  weather,
  tags,
}: {
  messages: Message[];
  canDelete: boolean;
  weather: MindWeather;
  // Categories by message id; empty for visitors.
  tags: Record<number, string[]>;
}) {
  return (
    <section aria-labelledby="thoughts-heading" data-weather={weather.kind} className="sky">
      <h2 id="thoughts-heading" className="sr-only">
        Thoughts
      </h2>
      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span aria-hidden className="text-5xl">
            ☀️
          </span>
          <p className="font-heading text-xl">Clear skies.</p>
          <p className="text-[15px] text-[var(--ink-soft)]">No thoughts this day.</p>
        </div>
      ) : (
        <ul className="flex flex-wrap items-start justify-center gap-x-6 gap-y-4">
          {messages.map((message) => (
            <ThoughtCloud
              key={message.id}
              id={message.id}
              text={message.text}
              size={cloudSize(message.text)}
              time={formatTime(message.sentAt)}
              isoTime={message.sentAt.toISOString()}
              source={SOURCE_LABELS[message.source]}
              canDelete={canDelete}
              tags={tags[message.id] ?? []}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
