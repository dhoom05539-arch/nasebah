import { describe, expect, it } from "vitest";

describe("Telegram bot credentials", () => {
  it("validates the configured bot token with getMe", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token).toBeTruthy();
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const payload = await response.json() as { ok?: boolean; result?: { username?: string }; description?: string };
    expect(response.ok, payload.description ?? "Telegram credential validation failed").toBe(true);
    expect(payload.ok).toBe(true);
    expect(payload.result?.username).toBe("company_attendance_makkah_bot");
  }, 20_000);
});
