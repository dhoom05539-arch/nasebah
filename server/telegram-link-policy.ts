export function canBindTelegramAccount(currentChatId: string | null | undefined, incomingChatId: string) {
  return !currentChatId || currentChatId === incomingChatId;
}

export function telegramBindingConflictMessage(employeeName: string) {
  return `هذا الموظف مرتبط مسبقًا بحساب تيليجرام آخر (${employeeName}). اطلب من المشرف فك الربط أولًا إذا كان التغيير مقصودًا.`;
}
