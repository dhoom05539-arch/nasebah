import { and, asc, eq, gte, lt } from "drizzle-orm";
import { attendance, employees } from "../drizzle/schema";
import { getDb, getNotificationSettings } from "./db";

export const LATE_GRACE_MINUTES = 20;
export const EARLY_CHECK_IN_MINUTES = 10;
const TIME_ZONE = "Asia/Riyadh";

type WeeklySchedule = Record<string, number | null>;

type LocalDateParts = { key: string; year: number; month: number; day: number; weekday: number; minutes: number };

export function lateMinutesFor(startMinutes: number, actualMinutes: number, graceMinutes = LATE_GRACE_MINUTES) {
  return Math.max(0, actualMinutes - startMinutes - graceMinutes);
}

export function currentLateStatus(scheduleJson: string | null, now = new Date(), graceMinutes = LATE_GRACE_MINUTES) {
  const current = localDateParts(now);
  const startMinutes = parseSchedule(scheduleJson)[String(current.weekday)];
  if (startMinutes === undefined || startMinutes === null) return { scheduled: false, lateMinutes: 0, dateKey: current.key, startMinutes: null, actualMinutes: current.minutes };
  return { scheduled: true, lateMinutes: lateMinutesFor(startMinutes, current.minutes, graceMinutes), dateKey: current.key, startMinutes, actualMinutes: current.minutes };
}

export function checkInWindow(scheduleJson: string | null, now = new Date(), earlyMinutes = EARLY_CHECK_IN_MINUTES) {
  const current = localDateParts(now);
  const startMinutes = parseSchedule(scheduleJson)[String(current.weekday)];
  if (startMinutes === undefined || startMinutes === null) return { scheduled: false, allowed: true, minutesUntilStart: 0 };
  const minutesUntilStart = startMinutes - current.minutes;
  return { scheduled: true, allowed: minutesUntilStart <= earlyMinutes, minutesUntilStart };
}

export function localDateParts(date: Date): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "0";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const weekdayName = get("weekday");
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekdayName] ?? 0;
  return { key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, year, month, day, weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function parseSchedule(value: string | null): WeeklySchedule {
  if (!value) return {};
  try { return JSON.parse(value) as WeeklySchedule; } catch { return {}; }
}

function monthBounds(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("صيغة الشهر يجب أن تكون YYYY-MM");
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error("الشهر غير صحيح");
  const start = new Date(`${month}-01T00:00:00+03:00`);
  const end = new Date(monthNumber === 12 ? `${year + 1}-01-01T00:00:00+03:00` : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01T00:00:00+03:00`);
  return { start, end, year, monthNumber };
}

function daysToEvaluate(start: Date, end: Date) {
  const now = new Date();
  const effectiveEnd = now < end ? now : new Date(end.getTime() - 1);
  const days: LocalDateParts[] = [];
  for (let cursor = new Date(start); cursor < effectiveEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(localDateParts(cursor));
  }
  return days;
}

export async function monthlyAttendanceReport(month: string) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const settings = await getNotificationSettings();
  const graceMinutes = settings.graceMinutes;
  const baseBounds = monthBounds(month);
  const bounds = settings.attendanceStartDate && settings.attendanceStartDate > `${month}-01` ? { ...baseBounds, start: new Date(`${settings.attendanceStartDate}T00:00:00+03:00`) } : baseBounds;
  const rows = await db.select({ record: attendance, employee: employees }).from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id)).where(and(gte(attendance.recordedAt, bounds.start), lt(attendance.recordedAt, bounds.end))).orderBy(asc(attendance.recordedAt));
  const grouped = new Map<number, Map<string, { checkIn?: Date; checkOut?: Date; checkInRecord?: typeof rows[number]["record"]; checkOutRecord?: typeof rows[number]["record"] }>>();
  for (const row of rows) {
    const dateKey = localDateParts(row.record.recordedAt).key;
    if (!grouped.has(row.employee.id)) grouped.set(row.employee.id, new Map());
    const day = grouped.get(row.employee.id)!.get(dateKey) ?? {};
    if (row.record.action === "check_in" && !day.checkIn) { day.checkIn = row.record.recordedAt; day.checkInRecord = row.record; }
    if (row.record.action === "check_out" && !day.checkOut) { day.checkOut = row.record.recordedAt; day.checkOutRecord = row.record; }
    grouped.get(row.employee.id)!.set(dateKey, day);
  }
  const calendarDays = daysToEvaluate(bounds.start, bounds.end);
  const employeesRows = await db.select().from(employees).where(eq(employees.active, 1)).orderBy(employees.branch, employees.name);
  const reportRows = employeesRows.map(employee => {
    const schedule = parseSchedule(employee.scheduleJson);
    const employeeDays = grouped.get(employee.id) ?? new Map();
    let scheduledDays = 0, attendanceDays = 0, absentDays = 0, lateDays = 0, lateMinutes = 0;
    let firstCheckIn: Date | null = null;
    for (const day of calendarDays) {
      const startMinutes = schedule[String(day.weekday)];
      if (startMinutes === undefined || startMinutes === null) continue;
      scheduledDays++;
      const attendanceDay = employeeDays.get(day.key);
      if (attendanceDay?.checkIn) {
        attendanceDays++;
        if (!firstCheckIn || attendanceDay.checkIn < firstCheckIn) firstCheckIn = attendanceDay.checkIn;
        const actual = localDateParts(attendanceDay.checkIn).minutes;
        const countedLate = lateMinutesFor(startMinutes, actual, graceMinutes);
        if (countedLate > 0) { lateDays++; lateMinutes += countedLate; }
      } else if (day.key < localDateParts(new Date()).key || (day.key === localDateParts(new Date()).key && localDateParts(new Date()).minutes > startMinutes + graceMinutes)) {
        absentDays++;
      }
    }
    const details = Array.from(employeeDays.entries()).map(([date, day]) => ({ date, checkIn: day.checkIn ?? null, checkOut: day.checkOut ?? null, locationName: day.checkInRecord?.locationName ?? day.checkOutRecord?.locationName ?? null, note: day.checkInRecord?.note ?? day.checkOutRecord?.note ?? null })).sort((a, b) => a.date.localeCompare(b.date));
    return { employeeId: employee.id, name: employee.name, branch: employee.branch, scheduledDays, attendanceDays, absentDays, lateDays, lateMinutes, firstCheckIn, details };
  });
  return { month, graceMinutes, evaluatedThrough: localDateParts(new Date()).key, rows: reportRows, totals: { scheduledDays: reportRows.reduce((sum, row) => sum + row.scheduledDays, 0), attendanceDays: reportRows.reduce((sum, row) => sum + row.attendanceDays, 0), absentDays: reportRows.reduce((sum, row) => sum + row.absentDays, 0), lateDays: reportRows.reduce((sum, row) => sum + row.lateDays, 0), lateMinutes: reportRows.reduce((sum, row) => sum + row.lateMinutes, 0) } };
}

export async function monthlyAbsenceRecords(month: string) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const settings = await getNotificationSettings();
  const baseBounds = monthBounds(month);
  const bounds = settings.attendanceStartDate && settings.attendanceStartDate > `${month}-01` ? { ...baseBounds, start: new Date(`${settings.attendanceStartDate}T00:00:00+03:00`) } : baseBounds;
  const records = await db.select({ employeeId: attendance.employeeId, recordedAt: attendance.recordedAt, action: attendance.action }).from(attendance).where(and(gte(attendance.recordedAt, bounds.start), lt(attendance.recordedAt, bounds.end)));
  const present = new Set(records.filter(record => record.action === "check_in").map(record => `${record.employeeId}:${localDateParts(record.recordedAt).key}`));
  const employeesRows = await db.select().from(employees).where(eq(employees.active, 1)).orderBy(asc(employees.branch), asc(employees.name));
  const result: Array<{ employeeId: number; name: string; branch: string; date: string; scheduledStart: number }> = [];
  const todayKey = localDateParts(new Date()).key;
  for (const employee of employeesRows) {
    const schedule = parseSchedule(employee.scheduleJson);
    for (const day of daysToEvaluate(bounds.start, bounds.end)) {
      const scheduledStart = schedule[String(day.weekday)];
      const afterGrace = day.key < todayKey || (day.key === todayKey && day.minutes > (scheduledStart ?? 0) + settings.graceMinutes);
      if (scheduledStart !== undefined && scheduledStart !== null && afterGrace && !present.has(`${employee.id}:${day.key}`)) result.push({ employeeId: employee.id, name: employee.name, branch: employee.branch, date: day.key, scheduledStart });
    }
  }
  return { month, graceMinutes: settings.graceMinutes, rows: result };
}

export async function dailyAttendanceReport(dateKey: string) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const start = new Date(`${dateKey}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const [employeesRows, records] = await Promise.all([
    db.select().from(employees).where(eq(employees.active, 1)).orderBy(asc(employees.branch), asc(employees.name)),
    db.select({ record: attendance }).from(attendance).where(and(gte(attendance.recordedAt, start), lt(attendance.recordedAt, end))).orderBy(asc(attendance.recordedAt)),
  ]);
  const byEmployee = new Map<number, { checkIn?: Date; checkOut?: Date }>();
  for (const row of records) { const day = byEmployee.get(row.record.employeeId) ?? {}; if (row.record.action === "check_in" && !day.checkIn) day.checkIn = row.record.recordedAt; if (row.record.action === "check_out" && !day.checkOut) day.checkOut = row.record.recordedAt; byEmployee.set(row.record.employeeId, day); }
  const settings = await getNotificationSettings();
  const formatTime = (value?: Date) => value ? new Intl.DateTimeFormat("ar-SA", { timeStyle: "short", timeZone: TIME_ZONE }).format(value) : "—";
  const weekday = localDateParts(start).weekday;
  const rows = employeesRows.map(employee => { const day = byEmployee.get(employee.id); const status = currentLateStatus(employee.scheduleJson, day?.checkIn ?? start, settings.graceMinutes); const scheduled = parseSchedule(employee.scheduleJson)[String(weekday)] !== undefined && parseSchedule(employee.scheduleJson)[String(weekday)] !== null; const late = day?.checkIn && status.scheduled ? lateMinutesFor(status.startMinutes ?? 0, localDateParts(day.checkIn).minutes, settings.graceMinutes) : 0; return { employeeId: employee.id, name: employee.name, branch: employee.branch, checkIn: formatTime(day?.checkIn), checkOut: formatTime(day?.checkOut), status: day?.checkIn ? (late > 0 ? "متأخر" : "حاضر") : scheduled ? "غياب" : "إجازة", lateMinutes: late }; });
  return { dateKey, rows, totals: { present: rows.filter(row => row.status === "حاضر" || row.status === "متأخر").length, absent: rows.filter(row => row.status === "غياب").length, late: rows.filter(row => row.status === "متأخر").length, lateMinutes: rows.reduce((sum, row) => sum + row.lateMinutes, 0) } };
}

export { monthBounds, parseSchedule };
