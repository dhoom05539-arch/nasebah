import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, eq, gte, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createAttendance, createAttendanceOncePerDay, createEmployee, deleteEmployee, deleteUserAccount, getDashboardCredentials, getDb, getNotificationSettings, listEmployees, listLocations, listRecentAttendance, listUsers, resetEmployeeTelegram, saveDashboardCredentials, saveTelegramLinkCode, todaySummary, updateEmployee, updateNotificationSettings, updateUserAccount, upsertUser } from "./db";
import { attendance, employees, workLocations } from "../drizzle/schema";
import { isWithinRadius } from "./geo";
import { hashLinkCode } from "./link-code";
import { checkInWindow, monthlyAbsenceRecords, monthlyAttendanceReport } from "./report";
import { maybeSendLateAlert } from "./telegram";
import { duplicateActionMessage } from "./attendance-policy";
import { isOwnerIdentity, OWNER_EMAIL } from "./admin-policy";
import { DASHBOARD_AUTH_VERSION, DASHBOARD_USERNAME, hashPassword, verifyPassword } from "./local-auth";

const isOwner = (user: { email: string | null; openId: string }) => isOwnerIdentity(user.email, user.openId, process.env.OWNER_OPEN_ID ?? "");
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && !isOwner(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "صلاحية الإدارة مطلوبة" });
  return next({ ctx });
});
const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isOwner(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمالك فقط" });
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    localLogin: publicProcedure.input(z.object({ username: z.string().trim().min(3).max(320), password: z.string().min(1).max(200), rememberMe: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      const stored = await getDashboardCredentials();
      const configuredUsername = stored?.username ?? DASHBOARD_USERNAME;
      const passwordHash = stored?.passwordHash ?? process.env.DASHBOARD_PASSWORD_HASH;
      if (!configuredUsername || !passwordHash || input.username.trim().toLowerCase() !== configuredUsername || !verifyPassword(input.password, passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      const openId = `local:${configuredUsername}`;
      if (!stored) await saveDashboardCredentials(configuredUsername, passwordHash);
      await upsertUser({ openId, name: "مالك النظام", email: OWNER_EMAIL, loginMethod: "local-password", role: "admin", lastSignedIn: new Date() });
      const sessionDuration = input.rememberMe ? 365 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
      const token = await sdk.createSessionToken(openId, { name: "مالك النظام", expiresInMs: sessionDuration });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: sessionDuration });
      return { success: true, authVersion: DASHBOARD_AUTH_VERSION } as const;
    }),
    changeCredentials: adminProcedure.input(z.object({ currentPassword: z.string().min(1).max(200), username: z.string().trim().min(4).max(320), newPassword: z.string().min(8).max(200) })).mutation(async ({ input }) => {
      const stored = await getDashboardCredentials();
      const currentHash = stored?.passwordHash ?? process.env.DASHBOARD_PASSWORD_HASH;
      if (!currentHash || !verifyPassword(input.currentPassword, currentHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور الحالية غير صحيحة" });
      await saveDashboardCredentials(input.username.trim().toLowerCase(), hashPassword(input.newPassword));
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => { ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 }); return { success: true } as const; }),
  }),
  attendance: router({
    dashboard: publicProcedure.query(async () => ({ summary: await todaySummary(), recent: await listRecentAttendance(12), employees: await listEmployees(), locations: await listLocations() })),
    employees: publicProcedure.query(() => listEmployees()),
    importEmployees: adminProcedure.input(z.object({ rows: z.array(z.object({ name: z.string().trim().min(2).max(160), branch: z.string().trim().min(1).max(160), phone: z.string().trim().max(32).optional(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() })).min(1).max(500) })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const locations = await listLocations(); const validBranches = new Set(locations.map(location => location.name));
      const invalid = input.rows.filter(row => !validBranches.has(row.branch));
      if (invalid.length) throw new TRPCError({ code: "BAD_REQUEST", message: `الفروع غير موجودة أو غير نشطة: ${Array.from(new Set(invalid.map(row => row.branch))).join("، ")}` });
      let createdCount = 0; let updatedCount = 0;
      for (const row of input.rows) {
        const startMinutes = row.startTime ? Number(row.startTime.slice(0, 2)) * 60 + Number(row.startTime.slice(3, 5)) : null;
        const scheduleJson = startMinutes === null ? null : JSON.stringify({ "0": startMinutes, "1": startMinutes, "2": startMinutes, "3": startMinutes, "4": startMinutes, "5": null, "6": null });
        const existing = (await db.select({ id: employees.id }).from(employees).where(and(eq(employees.name, row.name), eq(employees.branch, row.branch))).limit(1))[0];
        if (existing) { await updateEmployee(existing.id, { phone: row.phone || null, active: 1, scheduleJson, defaultStartTime: row.startTime || null, defaultEndTime: row.endTime || null }); updatedCount++; }
        else { await createEmployee({ name: row.name, branch: row.branch, phone: row.phone || null, active: 1, scheduleJson, defaultStartTime: row.startTime || null, defaultEndTime: row.endTime || null }); createdCount++; }
      }
      return { imported: input.rows.length, created: createdCount, updated: updatedCount };
    }),
    users: ownerProcedure.query(() => listUsers()),
    notificationSettings: adminProcedure.query(() => getNotificationSettings()),
    monthlyReport: adminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ input }) => monthlyAttendanceReport(input.month)),
    absences: adminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ input }) => monthlyAbsenceRecords(input.month)),
    generateLinkCode: adminProcedure.input(z.object({ employeeId: z.number().int(), customCode: z.string().trim().min(4).max(32).regex(/^[A-Za-z0-9_-]+$/).optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee || !employee.active) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود أو غير نشط" });
      const code = input.customCode ? input.customCode.toUpperCase() : randomBytes(5).toString("hex").toUpperCase();
      const existingCode = (await db.select({ id: employees.id }).from(employees).where(eq(employees.telegramLinkCodeHash, hashLinkCode(code))).limit(1))[0];
      if (existingCode && existingCode.id !== employee.id) throw new TRPCError({ code: "CONFLICT", message: "هذا الرمز مستخدم حاليًا لموظف آخر، اختر رمزًا مختلفًا" });
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await saveTelegramLinkCode(employee.id, hashLinkCode(code), expiresAt);
      return { employeeId: employee.id, employeeName: employee.name, code, expiresAt };
    }),
    create: adminProcedure.input(z.object({ employeeId: z.number().int(), action: z.enum(["check_in", "check_out"]), latitude: z.number(), longitude: z.number(), accuracyMeters: z.number().optional(), note: z.string().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee || !employee.active) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف غير موجود أو غير نشط" });
      if (input.action === "check_in") { const window = checkInWindow(employee.scheduleJson); if (!window.allowed) throw new TRPCError({ code: "BAD_REQUEST", message: `لا يمكن تسجيل الحضور قبل بداية الدوام بأكثر من 10 دقائق. متبقي ${window.minutesUntilStart} دقيقة.` }); }
      const location = (await db.select().from(workLocations).where(eq(workLocations.name, employee.branch)).limit(1))[0];
      if (!location || !location.active) throw new TRPCError({ code: "BAD_REQUEST", message: "الفرع المحدد غير متاح" });
      const targetLatitude = employee.latitude ?? location.latitude;
      const targetLongitude = employee.longitude ?? location.longitude;
      const targetRadius = employee.radiusMeters ?? location.radiusMeters;
      if (!isWithinRadius(input.latitude, input.longitude, targetLatitude, targetLongitude, targetRadius)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `الموقع خارج نطاق ${location.name} (المسموح ${targetRadius} متر)` });
      }
      const created = await createAttendanceOncePerDay({ ...input, locationName: location.name });
      if (!created) throw new TRPCError({ code: "CONFLICT", message: duplicateActionMessage(input.action) });
      if (input.action === "check_in") await maybeSendLateAlert(employee, location.name);
      return { success: true, locationName: location.name };
    }),
    correct: adminProcedure.input(z.object({ recordId: z.number().int(), action: z.enum(["check_in", "check_out"]).optional(), recordedAt: z.coerce.date().optional(), note: z.string().min(3) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const record = (await db.select().from(attendance).where(eq(attendance.id, input.recordId)).limit(1))[0];
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "سجل الحضور غير موجود" });
      await db.update(attendance).set({ action: input.action ?? record.action, recordedAt: input.recordedAt ?? record.recordedAt, note: `تصحيح مشرف: ${input.note}` }).where(eq(attendance.id, input.recordId));
      return { success: true };
    }),
    correctAbsence: adminProcedure.input(z.object({ employeeId: z.number().int(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), scheduledStart: z.number().int().min(0).max(1439), note: z.string().min(3) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee || !employee.active) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود أو غير نشط" });
      const start = new Date(`${input.date}T00:00:00+03:00`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const existing = (await db.select({ id: attendance.id }).from(attendance).where(and(eq(attendance.employeeId, input.employeeId), eq(attendance.action, "check_in"), gte(attendance.recordedAt, start), lt(attendance.recordedAt, end))).limit(1))[0];
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "يوجد حضور مسجل لهذا الموظف في هذا اليوم" });
      const hours = String(Math.floor(input.scheduledStart / 60)).padStart(2, "0");
      const minutes = String(input.scheduledStart % 60).padStart(2, "0");
      await createAttendance({ employeeId: input.employeeId, action: "check_in", recordedAt: new Date(`${input.date}T${hours}:${minutes}:00+03:00`), locationName: employee.branch, note: `تصحيح غياب مشرف: ${input.note}` });
      return { success: true };
    }),
    addEmployee: adminProcedure.input(z.object({ name: z.string().min(2), branch: z.string().min(1), phone: z.string().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.insert(employees).values(input); return { success: true }; }),
    updateEmployee: adminProcedure.input(z.object({ employeeId: z.number().int(), name: z.string().min(2), branch: z.string().min(1), latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(), radiusMeters: z.number().int().min(10).max(5000).nullable(), phone: z.string().optional(), active: z.number().int().min(0).max(1) }).refine(value => (value.latitude === null && value.longitude === null) || (value.latitude !== null && value.longitude !== null), { message: "يجب إدخال خط العرض وخط الطول معًا" })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" }); const location = (await db.select({ name: workLocations.name }).from(workLocations).where(and(eq(workLocations.name, input.branch), eq(workLocations.active, 1))).limit(1))[0]; if (!location) throw new TRPCError({ code: "BAD_REQUEST", message: "الفرع غير موجود أو غير نشط" }); return updateEmployee(input.employeeId, { name: input.name, branch: input.branch, latitude: input.latitude, longitude: input.longitude, radiusMeters: input.radiusMeters, phone: input.phone || null, active: input.active }); }),
    deleteEmployee: adminProcedure.input(z.object({ employeeId: z.number().int() })).mutation(({ input }) => deleteEmployee(input.employeeId)),
    resetTelegram: adminProcedure.input(z.object({ employeeId: z.number().int() })).mutation(({ input }) => resetEmployeeTelegram(input.employeeId)),
    updateNotificationSettings: adminProcedure.input(z.object({ graceMinutes: z.number().int().min(0).max(240), summaryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })).mutation(({ input }) => updateNotificationSettings(input)),
    updateUser: ownerProcedure.input(z.object({ userId: z.number().int(), name: z.string().min(2), role: z.enum(["admin", "user"]), branch: z.string().nullable(), latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(), radiusMeters: z.number().int().min(10).max(5000).nullable() }).refine(value => (value.latitude === null && value.longitude === null) || (value.latitude !== null && value.longitude !== null), { message: "يجب إدخال خط العرض وخط الطول معًا" })).mutation(async ({ input, ctx }) => { if (input.userId === ctx.user.id && input.role !== "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك إزالة صلاحية المالك الحالية" }); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" }); if (input.branch) { const branch = (await db.select({ name: workLocations.name }).from(workLocations).where(and(eq(workLocations.name, input.branch), eq(workLocations.active, 1))).limit(1))[0]; if (!branch) throw new TRPCError({ code: "BAD_REQUEST", message: "الفرع غير موجود أو غير نشط" }); } return updateUserAccount(input.userId, { name: input.name, role: input.role, branch: input.branch, latitude: input.latitude, longitude: input.longitude, radiusMeters: input.radiusMeters }); }),
    deleteUser: ownerProcedure.input(z.object({ userId: z.number().int() })).mutation(({ input, ctx }) => { if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك حذف حسابك الحالي" }); return deleteUserAccount(input.userId); }),
  }),
});
export type AppRouter = typeof appRouter;
