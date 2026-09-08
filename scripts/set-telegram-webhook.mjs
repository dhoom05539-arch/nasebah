import { createHash } from "node:crypto";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing");
const webhookUrl = "https://attendanceap-j3xvzobn.manus.space/api/telegram/webhook";
const secret = createHash("sha256").update(token).digest("hex").slice(0, 48);
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: webhookUrl, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false }),
});
const payload = await response.json();
if (!response.ok || !payload.ok) throw new Error(payload.description ?? "setWebhook failed");
console.log("Telegram webhook configured", webhookUrl);
const infoResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const info = await infoResponse.json();
if (!infoResponse.ok || !info.ok) throw new Error(info.description ?? "getWebhookInfo failed");
console.log(JSON.stringify({ url: info.result?.url, pending_update_count: info.result?.pending_update_count, last_error_message: info.result?.last_error_message ?? null }));
