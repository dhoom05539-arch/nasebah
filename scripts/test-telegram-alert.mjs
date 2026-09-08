const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
if (!token || !chatId) throw new Error("Telegram alert configuration is incomplete");
const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, text: "تم تفعيل تنبيهات بصمة نسيبة ✅\nسيصلك تنبيه عندما يتجاوز الموظف مهلة التأخير 20 دقيقة." }),
});
const payload = await response.json();
if (!response.ok || !payload.ok) throw new Error(payload.description ?? "Telegram test message failed");
console.log("Telegram alert test delivered successfully");
