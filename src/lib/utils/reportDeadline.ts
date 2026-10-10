// Weekly-report due dates (FR-WR-05: reports are due Tuesday). Shared by the
// late-submission check (weeklyReportService) and the calendar's DEADLINE
// events (calendarService) so both agree on what "due" means.
//
// `WeeklyReport.weekStart`/`weekEnd` and `DailyReportEntry.reportDate` are
// calendar dates stored as UTC midnight (see generateWeeklyReportForm), so
// day-of-week math on them uses the UTC getters. The *instant* a report
// becomes late is end-of-day Tuesday in Manila, where every student is.

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const TUESDAY = 2;
const MONDAY = 1;

// The calendar date (UTC midnight) of the first Tuesday strictly after `weekEnd`.
export function getWeeklyReportDueDate(weekEnd: Date): Date {
  const daysUntilTuesday = (TUESDAY - weekEnd.getUTCDay() + 7) % 7 || 7;
  return new Date(weekEnd.getTime() + daysUntilTuesday * DAY_MS);
}

// 23:59:59.999 Manila time on the due date, as a UTC instant.
export function getWeeklyReportDueInstant(weekEnd: Date): Date {
  return new Date(getWeeklyReportDueDate(weekEnd).getTime() + DAY_MS - MANILA_OFFSET_MS - 1);
}

export function isWeeklyReportLate(weekEnd: Date, at: Date = new Date()): boolean {
  return at.getTime() > getWeeklyReportDueInstant(weekEnd).getTime();
}

// Normalizes any date to the Monday (UTC midnight) of its Mon–Sun week, using
// the Manila-local calendar day so a submission made early Monday morning in
// Manila (still Sunday in UTC) lands on the right week.
export function getWeekStartMonday(date: Date): Date {
  const manila = new Date(date.getTime() + MANILA_OFFSET_MS);
  const dayStart = Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate());
  const daysSinceMonday = (manila.getUTCDay() - MONDAY + 7) % 7;
  return new Date(dayStart - daysSinceMonday * DAY_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// "YYYY-MM-DD" for a UTC-midnight calendar date.
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
