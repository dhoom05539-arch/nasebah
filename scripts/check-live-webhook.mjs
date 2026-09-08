import { createHash } from "node:crypto";
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing");
const secret = createHash("sha256").update(token).digest("hex").slice(0, 48);
const response = await fetch("https://attendanceap-j3xvzobn.manus.space/api/telegram/webhook", {
  method: "POST",
  headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
  body: JSON.stringify({}),
});
console.log("LIVE_WEBHOOK_STATUS", response.status);
if (response.status !== 200) throw new Error(await response.text());
