import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { distanceMeters, isWithinRadius } from "./geo";
import type { TrpcContext } from "./_core/context";
import { canRecordDailyAction, duplicateActionMessage } from "./attendance-policy";

function context(user?: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("attendance", () => {
  it("allows one check-in or check-out per day and explains duplicates", () => {
    expect(canRecordDailyAction(false)).toBe(true);
    expect(canRecordDailyAction(true)).toBe(false);
    expect(duplicateActionMessage("check_in")).toContain("الحضور");
    expect(duplicateActionMessage("check_out")).toContain("الانصراف");
  });

  it("exposes a dashboard summary, imported employees, and configured locations", async () => {
    const result = await appRouter.createCaller(context()).attendance.dashboard();
    expect(result.summary).toEqual(expect.objectContaining({ employees: expect.any(Number), present: expect.any(Number) }));
    expect(result.employees.length).toBeGreaterThanOrEqual(8);
    expect(result.locations.length).toBe(3);
    expect(result.locations.every(location => location.radiusMeters === 150)).toBe(true);
  });

  it("rejects attendance writes without a signed-in administrator", async () => {
    await expect(appRouter.createCaller(context()).attendance.create({ employeeId: 1, action: "check_in", latitude: 21.3594, longitude: 39.9050 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows link-code generation only for admins", async () => {
    const user = { id: 2, openId: "regular-user", name: "Regular", email: "regular@example.com", loginMethod: "test", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    await expect(appRouter.createCaller(context(user)).attendance.generateLinkCode({ employeeId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows attendance corrections only for admins", async () => {
    const user = { id: 2, openId: "regular-user", name: "Regular", email: "regular@example.com", loginMethod: "test", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    await expect(appRouter.createCaller(context(user)).attendance.correct({ recordId: 1, note: "تصحيح" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps branch selection server-side", async () => {
    const result = await appRouter.createCaller(context()).attendance.dashboard();
    const employee = result.employees.find(item => item.branch === "الفرع الرئيسي");
    const branch = result.locations.find(item => item.name === employee?.branch);
    expect(employee).toBeTruthy();
    expect(branch).toBeTruthy();
  });
});

describe("geo fencing", () => {
  it("accepts a point inside the branch radius and rejects a distant point", () => {
    expect(isWithinRadius(21.35944, 39.90506, 21.3594375, 39.9050625, 150)).toBe(true);
    expect(isWithinRadius(21.3615, 39.9050, 21.3594375, 39.9050625, 150)).toBe(false);
    expect(distanceMeters(21.3594375, 39.9050625, 21.3594375, 39.9050625)).toBe(0);
  });
});
