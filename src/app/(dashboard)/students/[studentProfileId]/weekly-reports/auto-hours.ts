import { minutesBetween } from "@/lib/validators/report";

// Hours to pre-fill from a time-in/time-out pair: the window minus a 1-hour
// lunch for spans over 5 h, floored (never rounded up) to the quarter hour so
// the value always fits the window that dailyEntrySchema enforces. Null when
// the pair is incomplete or out isn't after in. The student can still edit.
export function autoHoursFromTimes(timeIn: string, timeOut: string): number | null {
  if (!timeIn || !timeOut) return null;
  const minutes = minutesBetween(timeIn, timeOut);
  if (minutes <= 0) return null;
  const worked = minutes > 300 ? minutes - 60 : minutes;
  return Math.floor(worked / 15) / 4;
}
