// Display helpers for a WorkPlan.scheduleConfig ({ daysOfWeek, hoursPerDay,
// startTime?, endTime?, breakMinutes? }). Pure (no Prisma import) so client
// components can use them too.
import { spanMinutes } from "@/lib/utils/timeMath";

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ScheduleConfig {
  daysOfWeek: number[];
  hoursPerDay: number;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
}

export function parseScheduleConfig(value: unknown): ScheduleConfig | null {
  if (!value || typeof value !== "object") return null;
  const { daysOfWeek, hoursPerDay, startTime, endTime, breakMinutes } =
    value as Partial<ScheduleConfig>;
  if (!Array.isArray(daysOfWeek) || typeof hoursPerDay !== "number") return null;
  return {
    daysOfWeek,
    hoursPerDay,
    ...(typeof startTime === "string" ? { startTime } : {}),
    ...(typeof endTime === "string" ? { endTime } : {}),
    ...(typeof breakMinutes === "number" ? { breakMinutes } : {}),
  };
}

export function formatScheduleDays(daysOfWeek: number[]): string {
  return [...daysOfWeek]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d])
    .join(", ");
}

// "13:00" → "1:00 pm"
export function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// "8:00 am – 5:00 pm (1 h break)"; null when the schedule has no shift times.
export function formatShift(
  s: Pick<ScheduleConfig, "startTime" | "endTime" | "breakMinutes">
): string | null {
  if (!s.startTime || !s.endTime) return null;
  const nextDay = s.endTime <= s.startTime ? " (next day)" : ""; // night shift
  const range = `${clock(s.startTime)} – ${clock(s.endTime)}${nextDay}`;
  const brk = s.breakMinutes ?? 0;
  if (!brk) return range;
  return `${range} (${brk % 60 === 0 ? `${brk / 60} h` : `${brk} min`} break)`;
}

export function formatSchedule(config: ScheduleConfig): string {
  const weekly = config.daysOfWeek.length * config.hoursPerDay;
  const shift = formatShift(config);
  return `${formatScheduleDays(config.daysOfWeek)}${shift ? ` · ${shift}` : ""} · ${config.hoursPerDay} hrs/day (${weekly} hrs/week)`;
}

// "13:30" -> "1:30p" for the timetable's narrow phone cells.
export function clockShort(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
}

export const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

// Monday first, the way a work week is read.
export const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

// The work schedule as seven timetable cells: each working day with its shift, the rest off.
export function scheduleCells(config: ScheduleConfig) {
  const days = new Set(config.daysOfWeek);
  const start = config.startTime;
  const end = config.endTime;
  const nextDay = start && end && end <= start ? " (next day)" : "";
  const hrs = `${config.hoursPerDay} ${config.hoursPerDay === 1 ? "hr" : "hrs"}`;
  const over = dailyHours(config) > MAX_DAILY_HOURS;
  return MONDAY_FIRST.map((d) => {
    const working = days.has(d);
    const times = working && start && end;
    return {
      key: String(d),
      weekday: WEEKDAY_SHORT[d],
      tone: working ? (over ? ("flag" as const) : ("work" as const)) : ("off" as const),
      label: working ? hrs : "Off",
      short: times ? `${clockShort(start)}-${clockShort(end)}` : undefined,
      detail: times ? `${clock(start)} - ${clock(end)}${nextDay}` : undefined,
      description: working
        ? `${WEEKDAY_LONG[d]}: work, ${hrs}${times ? `, ${clock(start)} to ${clock(end)}${nextDay}` : ""}`
        : `${WEEKDAY_LONG[d]}: day off`,
    };
  });
}

// The daily limit for interns, cited to DOLE as the team and the faculty adviser specified
// (Nov 2026): at most 8 working hours a day, with a rest day. Over it is flagged for the
// adviser and coordinator to talk with the company; never a block.
export const MAX_DAILY_HOURS = 8;

// Working hours a day: the scheduled hours, or the shift minus its break if that is longer.
export function dailyHours(config: ScheduleConfig): number {
  const shift =
    config.startTime && config.endTime
      ? (spanMinutes(config.startTime, config.endTime) - (config.breakMinutes ?? 0)) / 60
      : 0;
  return Math.max(config.hoursPerDay, shift);
}

const hrsText = (h: number) => `${Math.round(h * 100) / 100} ${h === 1 ? "hour" : "hours"}`;

// Why a schedule goes past the daily limit, or null when it doesn't. A flag for the adviser and
// coordinator to act on (talk to the company, or pull the intern out): never a block, and
// overtime on single days is reported in the weekly report instead.
export function longSchedule(config: ScheduleConfig): { short: string; long: string } | null {
  const daily = dailyHours(config);
  const overDaily = daily > MAX_DAILY_HOURS;
  const noRestDay = new Set(config.daysOfWeek).size >= 7;
  if (!overDaily && !noRestDay) return null;
  const parts = [
    ...(overDaily ? [`${hrsText(daily)} of work a day`] : []),
    ...(noRestDay ? ["no rest day"] : []),
  ];
  return {
    short: `Schedule: ${[overDaily ? `${Math.round(daily * 100) / 100} h/day` : "", noRestDay ? "7 days" : ""].filter(Boolean).join(", ")} (DOLE: max ${MAX_DAILY_HOURS} h/day)`,
    long: `This schedule has ${parts.join(" and ")}. DOLE allows interns at most ${MAX_DAILY_HOURS} working hours a day, with a rest day.`,
  };
}
