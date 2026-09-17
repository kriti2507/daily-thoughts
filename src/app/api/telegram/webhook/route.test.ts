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
