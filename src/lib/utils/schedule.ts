// Display helpers for a WorkPlan.scheduleConfig ({ daysOfWeek, hoursPerDay,
// startTime?, endTime?, breakMinutes? }). Pure (no Prisma import) so client
// components can use them too.

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

function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// "8:00 am – 5:00 pm (1 h break)"; null when the schedule has no shift times.
export function formatShift(
  s: Pick<ScheduleConfig, "startTime" | "endTime" | "breakMinutes">
): string | null {
  if (!s.startTime || !s.endTime) return null;
  const range = `${clock(s.startTime)} – ${clock(s.endTime)}`;
  const brk = s.breakMinutes ?? 0;
  if (!brk) return range;
  return `${range} (${brk % 60 === 0 ? `${brk / 60} h` : `${brk} min`} break)`;
}

export function formatSchedule(config: ScheduleConfig): string {
  const weekly = config.daysOfWeek.length * config.hoursPerDay;
  const shift = formatShift(config);
  return `${formatScheduleDays(config.daysOfWeek)}${shift ? ` · ${shift}` : ""} · ${config.hoursPerDay} hrs/day (${weekly} hrs/week)`;
}
