const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 30 * 24 * 60;

export function normalizeRoutineInterval(value: number): number {
  if (!Number.isFinite(value)) return 24 * 60;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(value)));
}

export function routineIntervalMs(intervalMinutes: number): number {
  return normalizeRoutineInterval(intervalMinutes) * 60_000;
}

export function routineScheduleLabel(intervalMinutes: number): string {
  const minutes = normalizeRoutineInterval(intervalMinutes);
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes === 60) return "Every hour";
  if (minutes < 24 * 60 && minutes % 60 === 0) return `Every ${minutes / 60} hours`;
  if (minutes === 24 * 60) return "Every day";
  if (minutes === 7 * 24 * 60) return "Every week";
  if (minutes % (24 * 60) === 0) return `Every ${minutes / (24 * 60)} days`;
  return `Every ${minutes} minutes`;
}

export function routineStartsInLabel(intervalMinutes: number): string {
  const schedule = routineScheduleLabel(intervalMinutes);
  if (schedule === "Every hour") return "First run in an hour";
  if (schedule === "Every day") return "First run tomorrow";
  if (schedule === "Every week") return "First run in a week";
  return schedule.replace(/^Every /, "First run in ").toLowerCase().replace(/^first/, "First");
}

export function legacyCadence(intervalMinutes: number): "hourly" | "daily" {
  return normalizeRoutineInterval(intervalMinutes) < 24 * 60 ? "hourly" : "daily";
}
