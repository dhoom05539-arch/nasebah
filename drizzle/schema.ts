import { int, mysqlEnum, mysqlTable, timestamp, varchar, double, text } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  branch: varchar("branch", { length: 160 }),
  latitude: double("latitude"),
  longitude: double("longitude"),
  radiusMeters: int("radiusMeters").default(150),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  branch: varchar("branch", { length: 160 }).notNull(),
  latitude: double("latitude"),
  longitude: double("longitude"),
  radiusMeters: int("radiusMeters"),
  phone: varchar("phone", { length: 32 }),
  telegramChatId: varchar("telegramChatId", { length: 64 }).unique(),
  telegramPendingAction: mysqlEnum("telegramPendingAction", ["check_in", "check_out"]),
  telegramLinkCodeHash: varchar("telegramLinkCodeHash", { length: 64 }),
  telegramLinkCodeExpiresAt: timestamp("telegramLinkCodeExpiresAt"),
  scheduleJson: text("scheduleJson"),
  defaultStartTime: varchar("defaultStartTime", { length: 5 }),
  defaultEndTime: varchar("defaultEndTime", { length: 5 }),
  lastLateAlertDate: varchar("lastLateAlertDate", { length: 10 }),
  lastAbsenceAlertDate: varchar("lastAbsenceAlertDate", { length: 10 }),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workLocations = mysqlTable("work_locations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  radiusMeters: int("radiusMeters").default(150).notNull(),
  active: int("active").default(1).notNull(),
});

export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  action: mysqlEnum("action", ["check_in", "check_out"]).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  latitude: double("latitude"),
  longitude: double("longitude"),
  accuracyMeters: double("accuracyMeters"),
  locationName: varchar("locationName", { length: 160 }),
  note: text("note"),
});

export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").autoincrement().primaryKey(),
  graceMinutes: int("graceMinutes").default(20).notNull(),
  summaryTime: varchar("summaryTime", { length: 5 }).default("04:00").notNull(),
  attendanceStartDate: varchar("attendanceStartDate", { length: 10 }),
  summaryCronTaskUid: varchar("summaryCronTaskUid", { length: 65 }),
  lastSummaryDate: varchar("lastSummaryDate", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const dailyReports = mysqlTable("daily_reports", {
  id: int("id").autoincrement().primaryKey(),
  dateKey: varchar("dateKey", { length: 10 }).notNull().unique(),
  content: text("content").notNull(),
  telegramSentAt: timestamp("telegramSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const dashboardCredentials = mysqlTable("dashboard_credentials", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 200 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
