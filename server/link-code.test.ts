import { describe, expect, it } from "vitest";
import { hashLinkCode, isLinkCodeActive } from "./link-code";
import { canBindTelegramAccount, telegramBindingConflictMessage } from "./telegram-link-policy";

describe("telegram link codes", () => {
  it("normalizes case and whitespace before hashing", () => {
    expect(hashLinkCode(" abc123 ")).toBe(hashLinkCode("ABC123"));
  });

  it("accepts only the matching non-expired hash", () => {
    const hash = hashLinkCode("ABC123");
    const expiresAt = new Date(2_000);
    expect(isLinkCodeActive(hash, hash, expiresAt, 1_000)).toBe(true);
    expect(isLinkCodeActive(hash, hash, expiresAt, 2_000)).toBe(false);
    expect(isLinkCodeActive(hashLinkCode("OTHER"), hash, expiresAt, 1_000)).toBe(false);
  });

  it("binds an employee to one Telegram account only", () => {
    expect(canBindTelegramAccount(null, "111")).toBe(true);
    expect(canBindTelegramAccount("111", "111")).toBe(true);
    expect(canBindTelegramAccount("111", "222")).toBe(false);
    expect(telegramBindingConflictMessage("أحمد")).toContain("مرتبط مسبقًا");
  });

  it("does not treat a second chat as the same device", () => {
    expect(canBindTelegramAccount("phone-account-1", "phone-account-2")).toBe(false);
  });
});
