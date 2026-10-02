import { after } from "next/server";

import { classifyInBackground } from "@/lib/classify";
import { requireEnv, requireNumberEnv } from "@/lib/env";
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
  if (chatId !== requireNumberEnv("TELEGRAM_CHAT_ID")) {
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
    after(classifyInBackground);
  } catch (error) {
    // Losing one message beats unbounded Telegram retries against a down database.
    console.error("failed to store telegram message", error);
  }

  return ok();
}
