import { createHash } from "node:crypto";
import { claimAbsenceAlert, claimLateAlert, createAttendanceOncePerDay, clearTelegramLinkCode, clearTelegramPendingAction, consumeTelegramLinkCode, getEmployeeByTelegramChatId, getDb, getNotificationSettings, linkEmployeeToTelegram, setTelegramPendingAction } from "./db";
import { workLocations } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { isWithinRadius, distanceMeters } from "./geo";
import { hashLinkCode } from "./link-code";
import { checkInWindow, currentLateStatus } from "./report";
import { canBindTelegramAccount, telegramBindingConflictMessage } from "./telegram-link-policy";

const TELEGRAM_API = "https://api.telegram.org";
const BOT_USERNAME = "company_attendance_makkah_bot";
type AlertEmployee = { id: number; name: string; branch: string; scheduleJson: string | null };

export type TelegramUpdate = {
  message?: {
    chat?: { id: number | string };
    from?: { first_name?: string; last_name?: string; username?: string };
    text?: string;
    location?: { latitude: number; longitude: number; horizontal_accuracy?: number };
  };
};

function token() {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return value;
}

export function telegramWebhookSecret() {
  return createHash("sha256").update(token()).digest("hex").slice(0, 48);
}

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${TELEGRAM_API}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.description ?? `Telegram ${method} failed`);
  return payload.result as T;
}

export async function sendTelegramMessage(chatId: number | string, text: string, keyboard?: Record<string, unknown>) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

export async function maybeSendLateAlert(employee: AlertEmployee, locationName: string, recordedAt = new Date()) {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const settings = await getNotificationSettings();
  const status = currentLateStatus(employee.scheduleJson, recordedAt, settings.graceMinutes);
  if (!adminChatId || !status.scheduled || status.lateMinutes <= 0) return false;
  if (!(await claimLateAlert(employee.id, status.dateKey))) return false;
  await sendTelegramMessage(adminChatId, `تنبيه تأخير ⏰\nالموظف: ${employee.name}\nالفرع: ${locationName}\nالتأخير المحتسب: ${status.lateMinutes} دقيقة بعد مهلة ${settings.graceMinutes} دقيقة\nوقت التسجيل: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(recordedAt)}`);
  return true;
}

const actionKeyboard = {
  keyboard: [[{ text: "حضور" }, { text: "انصراف" }]],
  resize_keyboard: true,
  is_persistent: true,
};

const locationKeyboard = (action: string) => ({
  keyboard: [[{ text: "إرسال موقعي 📍", request_location: true }], [{ text: "إلغاء" }]],
  resize_keyboard: true,
  one_time_keyboard: true,
  input_field_placeholder: `أرسل موقعك لتسجيل ${action}`,
});

function normalizeName(value: string) {
  return value.replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.chat?.id) return;
  const chatId = String(message.chat.id);
  const text = normalizeName(message.text ?? "");
  const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || "الموظف";

  if (text === "/myid") { await sendTelegramMessage(chatId, `معرف محادثتك هو: ${chatId}`); return; }

  const linkedEmployee = await getEmployeeByTelegramChatId(chatId);

  if (text === "/start" || text === "/help") {
    if (linkedEmployee) {
      await sendTelegramMessage(chatId, `مرحبًا ${linkedEmployee.name} 👋\nفرعك المرتبط: ${linkedEmployee.branch}\nاختر حضور أو انصراف ثم شارك موقعك.`, actionKeyboard);
    } else {
      await sendTelegramMessage(chatId, `مرحبًا ${senderName} 👋\nلربط حسابك بأمان، اطلب من الإدارة رمز ربط خاصًا بك ثم أرسله بهذا الشكل:\n/ربط ABC123DEF\n\nالرمز صالح لمدة 15 دقيقة ويُستخدم مرة واحدة.`, { remove_keyboard: true });
    }
    return;
  }

  if (text.startsWith("/ربط")) {
    const code = normalizeName(text.replace(/^\/ربط\s*/, "")).toUpperCase();
    if (!code) { await sendTelegramMessage(chatId, "أرسل الرمز بعد الأمر، مثال:\n/ربط ABC123DEF"); return; }
    const employee = await consumeTelegramLinkCode(hashLinkCode(code));
    if (!employee) { await sendTelegramMessage(chatId, "الرمز غير صحيح أو منتهي. اطلب من الإدارة إصدار رمز جديد."); return; }
    if (linkedEmployee && linkedEmployee.id !== employee.id) { await sendTelegramMessage(chatId, "هذا الحساب مربوط مسبقًا بموظف آخر، ولا يمكن استخدامه لربط موظف ثانٍ."); return; }
    if (!canBindTelegramAccount(employee.telegramChatId, chatId)) { await sendTelegramMessage(chatId, telegramBindingConflictMessage(employee.name)); return; }
    await linkEmployeeToTelegram(employee.id, chatId);
    await clearTelegramLinkCode(employee.id);
    await sendTelegramMessage(chatId, `تم الربط بنجاح ✅\nالموظف: ${employee.name}\nالفرع: ${employee.branch}\nاختر حضور أو انصراف للبدء.`, actionKeyboard);
    return;
  }

  const employee = linkedEmployee;
  if (!employee) { await sendTelegramMessage(chatId, "حسابك غير مربوط بموظف. اطلب رمزك من المشرف ثم أرسل /ربط الرمز."); return; }

  if (text === "إلغاء") {
    await clearTelegramPendingAction(employee.id);
    await sendTelegramMessage(chatId, "تم الإلغاء.", actionKeyboard);
    return;
  }

  if (text === "حضور" || text === "انصراف") {
    const action = text === "حضور" ? "check_in" : "check_out" as "check_in" | "check_out";
    await setTelegramPendingAction(employee.id, action);
    await sendTelegramMessage(chatId, `تم اختيار ${text}.\nفرعك: ${employee.branch}\nاضغط زر «إرسال موقعي 📍» الآن للتحقق من وجودك داخل نطاق الفرع.`, locationKeyboard(text));
    return;
  }

  if (message.location) {
    if (!employee.telegramPendingAction) { await sendTelegramMessage(chatId, "اختر حضور أو انصراف أولًا.", actionKeyboard); return; }
    if (employee.telegramPendingAction === "check_in") { const window = checkInWindow(employee.scheduleJson); if (!window.allowed) { await clearTelegramPendingAction(employee.id); await sendTelegramMessage(chatId, `لا يمكن تسجيل الحضور قبل بداية دوامك بأكثر من 10 دقائق. متبقي ${window.minutesUntilStart} دقيقة.`, actionKeyboard); return; } }
    const db = await getDb();
    if (!db) { await sendTelegramMessage(chatId, "تعذر الاتصال بالنظام الآن، حاول لاحقًا."); return; }
    const location = (await db.select().from(workLocations).where(eq(workLocations.name, employee.branch)).limit(1))[0];
    if (!location || !location.active) { await clearTelegramPendingAction(employee.id); await sendTelegramMessage(chatId, "لا يوجد موقع جغرافي مفعّل لفرعك. تواصل مع الإدارة.", actionKeyboard); return; }
    const targetLatitude = employee.latitude ?? location.latitude;
    const targetLongitude = employee.longitude ?? location.longitude;
    const targetRadius = employee.radiusMeters ?? location.radiusMeters;
    const distance = distanceMeters(message.location.latitude, message.location.longitude, targetLatitude, targetLongitude);
    if (!isWithinRadius(message.location.latitude, message.location.longitude, targetLatitude, targetLongitude, targetRadius)) {
      await clearTelegramPendingAction(employee.id);
      await sendTelegramMessage(chatId, `لم يتم التسجيل ❌\nأنت خارج نطاق ${location.name}.\nالمسافة التقريبية: ${Math.round(distance)} مترًا، والمسموح: ${targetRadius} مترًا.`, actionKeyboard);
      return;
    }
    const created = await createAttendanceOncePerDay({ employeeId: employee.id, action: employee.telegramPendingAction, latitude: message.location.latitude, longitude: message.location.longitude, accuracyMeters: message.location.horizontal_accuracy, locationName: location.name, note: "Telegram" });
    if (!created) { await clearTelegramPendingAction(employee.id); await sendTelegramMessage(chatId, `تم تسجيل ${employee.telegramPendingAction === "check_in" ? "الحضور" : "الانصراف"} لك مسبقًا اليوم. لا يمكن تسجيلها مرة أخرى.`, actionKeyboard); return; }
    if (employee.telegramPendingAction === "check_in") await maybeSendLateAlert(employee, location.name);
    const label = employee.telegramPendingAction === "check_in" ? "الحضور" : "الانصراف";
    await clearTelegramPendingAction(employee.id);
    await sendTelegramMessage(chatId, `تم تسجيل ${label} بنجاح ✅\nالموظف: ${employee.name}\nالفرع: ${location.name}\nالمسافة: ${Math.round(distance)} مترًا\nالوقت: ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date())}`, actionKeyboard);
    return;
  }

  await sendTelegramMessage(chatId, "استخدم الأزرار بالأسفل: حضور أو انصراف.", actionKeyboard);
}

export async function setTelegramWebhook(webhookUrl: string) {
  return telegramApi<boolean>("setWebhook", { url: webhookUrl, secret_token: telegramWebhookSecret(), allowed_updates: ["message"], drop_pending_updates: false });
}

export async function getTelegramWebhookInfo() {
  return telegramApi<{ url?: string; pending_update_count?: number; last_error_message?: string }>("getWebhookInfo");
}

export { BOT_USERNAME };
