export function canRecordDailyAction(hasExistingRecord: boolean) {
  return !hasExistingRecord;
}

export function duplicateActionMessage(action: "check_in" | "check_out") {
  return `تم تسجيل ${action === "check_in" ? "الحضور" : "الانصراف"} لهذا الموظف مسبقًا اليوم`;
}
