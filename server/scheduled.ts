import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { claimAbsenceAlert, getNotificationSettings, markDailyReportTelegramSent, saveDailyReport } from "./db";
import { monthlyAbsenceRecords, dailyAttendanceReport, localDateParts } from "./report";
import { sendTelegramMessage } from "./telegram";

function currentMonth() {
  const now = localDateParts(new Date());
  return `${now.year}-${String(now.month).padStart(2, "0")}`;
}

function formatDailyReport(report: Awaited<ReturnType<typeof dailyAttendanceReport>>) {
  const lines = report.rows.map((row, index) => `${index + 1}. ${row.name} — ${row.branch}\nالحالة: ${row.status} | حضور: ${row.checkIn} | انصراف: ${row.checkOut}${row.lateMinutes ? ` | التأخير: ${row.lateMinutes} دقيقة` : ""}`);
  return `تقرير الحضور والانصراف اليومي — ${report.dateKey}\n\n${lines.join("\n\n")}\n\nالإجمالي: حاضر ${report.totals.present} | غياب ${report.totals.absent} | متأخر ${report.totals.late}\nإجمالي دقائق التأخير: ${report.totals.lateMinutes}`;
}

export async function handleAttendanceNotifications(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const settings = await getNotificationSettings();
    const now = localDateParts(new Date());
    const month = currentMonth();
    const absenceReport = await monthlyAbsenceRecords(month);
    let absenceAlerts = 0;
    for (const absence of absenceReport.rows) {
      if (adminChatId && await claimAbsenceAlert(absence.employeeId, absence.date)) {
        await sendTelegramMessage(adminChatId, `تنبيه غياب ⚠️\nالموظف: ${absence.name}\nالفرع: ${absence.branch}\nالتاريخ: ${absence.date}\nلم يسجل حضورًا بعد انتهاء مهلة ${settings.graceMinutes} دقيقة.`);
        absenceAlerts++;
      }
    }
    const configured = settings.summaryTime.split(":").map(Number);
    const isSummaryTime = configured.length === 2 && configured[0] === Math.floor(now.minutes / 60) && configured[1] === now.minutes % 60;
    let summarySent = false;
    const currentDayStart = new Date(`${now.key}T00:00:00+03:00`);
    const reportDate = localDateParts(new Date(currentDayStart.getTime() - 24 * 60 * 60 * 1000)).key;
    if (isSummaryTime && (!settings.attendanceStartDate || reportDate >= settings.attendanceStartDate)) {
      const report = await dailyAttendanceReport(reportDate);
      const content = formatDailyReport(report);
      const saved = await saveDailyReport(reportDate, content);
      if (adminChatId && !saved.telegramSentAt) { await sendTelegramMessage(adminChatId, content); await markDailyReportTelegramSent(reportDate); summarySent = true; }
    }
    return res.json({ ok: true, absenceAlerts, summarySent, reportTime: settings.summaryTime, timestamp });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), timestamp });
  }
}

export { formatDailyReport };
