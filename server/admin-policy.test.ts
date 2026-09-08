import { describe, expect, it } from "vitest";
import { isOwnerIdentity } from "./admin-policy";

describe("owner identity", () => {
  it("recognizes the verified owner email or configured owner id", () => {
    expect(isOwnerIdentity("abdulrhmanbadwi@icloud.com", "oauth-id", "")).toBe(true);
    expect(isOwnerIdentity("other@example.com", "owner-id", "owner-id")).toBe(true);
    expect(isOwnerIdentity("other@example.com", "oauth-id", "")).toBe(false);
  });
});
