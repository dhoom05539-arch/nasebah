import { describe, expect, it } from "vitest";

describe("Telegram admin alert destination", () => {
  it("validates the configured admin chat id with getChat", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!token || !chatId) return;
    const response = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId ?? "")}`);
    const payload = await response.json() as { ok?: boolean; description?: string };
    expect(response.ok, payload.description ?? "Telegram admin chat validation failed").toBe(true);
    expect(payload.ok).toBe(true);
  }, 20_000);
});
