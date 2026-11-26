// Projected OJT completion: walk forward over the intern's working days until the
// remaining hours are covered. Shared by the live per-intern projection and the
// staff calendars, which project many interns at once.
export function projectCompletionDate(
  scheduleConfig: { daysOfWeek?: number[]; hoursPerDay?: number } | null | undefined,
  requiredHours: number,
  renderedHours: number,
  now: Date = new Date()
): Date | null {
  if (!scheduleConfig?.daysOfWeek?.length || !scheduleConfig.hoursPerDay) return null;

  const remainingHours = requiredHours - renderedHours;
  if (remainingHours <= 0) return now;

  // The latest approved plan already reflects an approved schedule change from today onward.

  const workingDays = new Set(scheduleConfig.daysOfWeek);
  const daysNeeded = Math.ceil(remainingHours / scheduleConfig.hoursPerDay);

  let projected = now;
  let workingDaysCounted = 0;
  while (workingDaysCounted < daysNeeded) {
    projected = new Date(projected.getTime() + 24 * 60 * 60 * 1000);
    if (workingDays.has(manilaDayOfWeek(projected))) workingDaysCounted += 1;
  }
  return projected;
}

// Schedules use Manila weekdays but servers run in UTC; read the weekday at UTC+8.
function manilaDayOfWeek(date: Date): number {
  const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
  return new Date(date.getTime() + MANILA_OFFSET_MS).getUTCDay();
}
