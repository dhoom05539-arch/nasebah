import { describe, expect, it } from "vitest";

describe("WhatsApp Cloud API credentials", () => {
  it("validates the configured phone number credentials when explicitly enabled", async () => {
    if (process.env.WHATSAPP_TEST_ENABLED !== "true") return;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    expect(phoneNumberId).toBeTruthy();
    expect(accessToken).toBeTruthy();
    const response = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}?fields=id,display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await response.json() as { id?: string; error?: { message?: string } };
    expect(response.ok, payload.error?.message ?? "WhatsApp credential validation failed").toBe(true);
    expect(payload.id).toBe(phoneNumberId);
  }, 20_000);
});
