import { describe, expect, it } from "vitest";
import { DASHBOARD_USERNAME, hashPassword, verifyPassword } from "./local-auth";

describe("local dashboard authentication", () => {
  it("uses the final configured username and verifies passwords safely", () => {
    expect(DASHBOARD_USERNAME).toBe("u85ll");
    expect(process.env.DASHBOARD_PASSWORD_HASH).toBeTruthy();
    const testHash = hashPassword("test-dashboard-password");
    expect(verifyPassword("test-dashboard-password", testHash)).toBe(true);
    expect(verifyPassword("wrong-password", testHash)).toBe(false);
  });
});
