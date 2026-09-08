import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { attendance, dashboardCredentials, dailyReports, employees, InsertUser, notificationSettings, users, workLocations } from "../drizzle/schema";
import { ENV } from './_core/env';
import { canRecordDailyAction } from "./attendance-policy";

let _db: ReturnType<typeof drizzle> | null = null;
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); }
  }
  return _db;
}
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb(); if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date(); updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) { values.role = user.role ?? "admin"; updateSet.role = values.role; }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return rows[0];
}
export async function getDashboardCredentials() { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); return (await db.select().from(dashboardCredentials).where(eq(dashboardCredentials.id, 1)).limit(1))[0]; }
export async function saveDashboardCredentials(username: string, passwordHash: string) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.insert(dashboardCredentials).values({ id: 1, username, passwordHash }).onDuplicateKeyUpdate({ set: { username, passwordHash } }); return getDashboardCredentials(); }
export async function listUsers() { const db = await getDb(); return db ? db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, branch: users.branch, latitude: users.latitude, longitude: users.longitude, radiusMeters: users.radiusMeters, role: users.role, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).orderBy(users.name) : []; }
export async function updateUserAccount(id: number, values: { name?: string; role?: "admin" | "user"; branch?: string | null; latitude?: number | null; longitude?: number | null; radiusMeters?: number | null }) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(users).set(values).where(eq(users.id, id)); }
export async function deleteUserAccount(id: number) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.delete(users).where(eq(users.id, id)); }
export async function listEmployees() { const db = await getDb(); return db ? db.select().from(employees).orderBy(employees.branch, employees.name) : []; }
export async function createEmployee(values: typeof employees.$inferInsert) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.insert(employees).values(values); }
export async function updateEmployee(employeeId: number, values: { name?: string; branch?: string; latitude?: number | null; longitude?: number | null; radiusMeters?: number | null; phone?: string | null; active?: number; scheduleJson?: string | null; defaultStartTime?: string | null; defaultEndTime?: string | null }) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(employees).set(values).where(eq(employees.id, employeeId)); }
export async function deleteEmployee(employeeId: number) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(employees).set({ active: 0, telegramChatId: null, telegramPendingAction: null, telegramLinkCodeHash: null, telegramLinkCodeExpiresAt: null }).where(eq(employees.id, employeeId)); }
export async function resetEmployeeTelegram(employeeId: number) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(employees).set({ telegramChatId: null, telegramPendingAction: null, telegramLinkCodeHash: null, telegramLinkCodeExpiresAt: null }).where(eq(employees.id, employeeId)); }
export async function listLocations() { const db = await getDb(); return db ? db.select().from(workLocations).where(eq(workLocations.active, 1)) : []; }
export async function getEmployeeByTelegramChatId(telegramChatId: string) { const db = await getDb(); if (!db) return undefined; const rows = await db.select().from(employees).where(eq(employees.telegramChatId, telegramChatId)).limit(1); return rows[0]; }
export async function linkEmployeeToTelegram(employeeId: number, telegramChatId: string) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const current = (await db.select({ telegramChatId: employees.telegramChatId }).from(employees).where(eq(employees.id, employeeId)).limit(1))[0]; if (current?.telegramChatId && current.telegramChatId !== telegramChatId) throw new Error("الموظف مرتبط بحساب تيليجرام آخر"); await db.update(employees).set({ telegramChatId: null, telegramPendingAction: null }).where(eq(employees.telegramChatId, telegramChatId)); await db.update(employees).set({ telegramChatId }).where(eq(employees.id, employeeId)); }
export async function setTelegramPendingAction(employeeId: number, action: "check_in" | "check_out") { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(employees).set({ telegramPendingAction: action }).where(eq(employees.id, employeeId)); }
export async function clearTelegramPendingAction(employeeId: number) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(employees).set({ telegramPendingAction: null }).where(eq(employees.id, employeeId)); }
export async function saveTelegramLinkCode(employeeId: number, codeHash: string, expiresAt: Date) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(employees).set({ telegramLinkCodeHash: codeHash, telegramLinkCodeExpiresAt: expiresAt }).where(eq(employees.id, employeeId)); }
export async function consumeTelegramLinkCode(codeHash: string) {
  const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const row = (await db.select().from(employees).where(eq(employees.telegramLinkCodeHash, codeHash)).limit(1))[0];
  if (!row || !row.telegramLinkCodeExpiresAt || row.telegramLinkCodeExpiresAt.getTime() <= Date.now()) return undefined;
  return row;
}
export async function clearTelegramLinkCode(employeeId: number) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(employees).set({ telegramLinkCodeHash: null, telegramLinkCodeExpiresAt: null }).where(eq(employees.id, employeeId)); }
export async function claimLateAlert(employeeId: number, dateKey: string) {
  const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const current = (await db.select({ lastLateAlertDate: employees.lastLateAlertDate }).from(employees).where(eq(employees.id, employeeId)).limit(1))[0];
  if (current?.lastLateAlertDate === dateKey) return false;
  await db.update(employees).set({ lastLateAlertDate: dateKey }).where(eq(employees.id, employeeId));
  return true;
}
export async function getNotificationSettings() { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const existing = (await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1))[0]; if (existing) return existing; await db.insert(notificationSettings).values({ id: 1 }); return (await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1))[0]!; }
export async function updateNotificationSettings(values: { graceMinutes?: number; summaryTime?: string; attendanceStartDate?: string | null }) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await getNotificationSettings(); await db.update(notificationSettings).set(values).where(eq(notificationSettings.id, 1)); return getNotificationSettings(); }
export async function claimAbsenceAlert(employeeId: number, dateKey: string) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const current = (await db.select({ lastAbsenceAlertDate: employees.lastAbsenceAlertDate }).from(employees).where(eq(employees.id, employeeId)).limit(1))[0]; if (current?.lastAbsenceAlertDate === dateKey) return false; await db.update(employees).set({ lastAbsenceAlertDate: dateKey }).where(eq(employees.id, employeeId)); return true; }
export async function claimDailySummary(dateKey: string) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await getNotificationSettings(); const current = (await db.select({ lastSummaryDate: notificationSettings.lastSummaryDate }).from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1))[0]; if (current?.lastSummaryDate === dateKey) return false; await db.update(notificationSettings).set({ lastSummaryDate: dateKey }).where(eq(notificationSettings.id, 1)); return true; }
export async function saveDailyReport(dateKey: string, content: string) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.insert(dailyReports).values({ dateKey, content }).onDuplicateKeyUpdate({ set: { content } }); return (await db.select().from(dailyReports).where(eq(dailyReports.dateKey, dateKey)).limit(1))[0]!; }
export async function markDailyReportTelegramSent(dateKey: string) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(dailyReports).set({ telegramSentAt: new Date() }).where(eq(dailyReports.dateKey, dateKey)); }
export async function listRecentAttendance(limit = 20) { const db = await getDb(); return db ? db.select({ record: attendance, employee: employees }).from(attendance).leftJoin(employees, eq(attendance.employeeId, employees.id)).orderBy(desc(attendance.recordedAt)).limit(limit) : []; }
export async function todaySummary() {
  const db = await getDb(); if (!db) return { employees: 0, checkIns: 0, checkOuts: 0, present: 0 };
  const start = riyadhDayBounds().start;
  const [employeeCount, inCount, outCount, presentRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(employees).where(eq(employees.active, 1)),
    db.select({ count: sql<number>`count(*)` }).from(attendance).where(and(eq(attendance.action, "check_in"), gte(attendance.recordedAt, start))),
    db.select({ count: sql<number>`count(*)` }).from(attendance).where(and(eq(attendance.action, "check_out"), gte(attendance.recordedAt, start))),
    db.select({ employeeId: attendance.employeeId }).from(attendance).where(gte(attendance.recordedAt, start)).groupBy(attendance.employeeId),
  ]);
  return { employees: Number(employeeCount[0]?.count ?? 0), checkIns: Number(inCount[0]?.count ?? 0), checkOuts: Number(outCount[0]?.count ?? 0), present: presentRows.length };
}
export async function createAttendance(input: typeof attendance.$inferInsert) { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const result = await db.insert(attendance).values(input); return result; }
function riyadhDayBounds(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "0";
  const key = `${get("year")}-${get("month")}-${get("day")}`;
  const start = new Date(`${key}T00:00:00+03:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
export async function createAttendanceOncePerDay(input: typeof attendance.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const bounds = riyadhDayBounds(input.recordedAt ?? new Date());
  const existing = (await db.select({ id: attendance.id }).from(attendance).where(and(eq(attendance.employeeId, input.employeeId), eq(attendance.action, input.action), gte(attendance.recordedAt, bounds.start), lt(attendance.recordedAt, bounds.end))).limit(1))[0];
  if (!canRecordDailyAction(Boolean(existing))) return false;
  await db.insert(attendance).values(input);
  return true;
}
