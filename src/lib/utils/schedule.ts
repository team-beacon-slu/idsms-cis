// Display helpers for a WorkPlan.scheduleConfig ({ daysOfWeek, hoursPerDay }).
// Pure (no Prisma import) so client components can use them too.

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ScheduleConfig {
  daysOfWeek: number[];
  hoursPerDay: number;
}

export function parseScheduleConfig(value: unknown): ScheduleConfig | null {
  if (!value || typeof value !== "object") return null;
  const { daysOfWeek, hoursPerDay } = value as Partial<ScheduleConfig>;
  if (!Array.isArray(daysOfWeek) || typeof hoursPerDay !== "number") return null;
  return { daysOfWeek, hoursPerDay };
}

export function formatScheduleDays(daysOfWeek: number[]): string {
  return [...daysOfWeek]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d])
    .join(", ");
}

export function formatSchedule(config: ScheduleConfig): string {
  const weekly = config.daysOfWeek.length * config.hoursPerDay;
  return `${formatScheduleDays(config.daysOfWeek)} · ${config.hoursPerDay} hrs/day (${weekly} hrs/week)`;
}
