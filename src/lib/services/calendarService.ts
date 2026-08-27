// Unified calendar aggregation across roles. See PRD Module 12 (FR-CAL-*).
import {
  Prisma,
  PrismaClient,
  Role,
  HolidayType,
  DeviationType,
  MoaStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Enums & Type Exports ──────────────────────────────────────────────────

export enum CalendarEventType {
  SUBMISSION_DEADLINE = "SUBMISSION_DEADLINE",
  HOLIDAY = "HOLIDAY",
  APPROVED_DEVIATION = "APPROVED_DEVIATION",
  PROJECTED_COMPLETION = "PROJECTED_COMPLETION",
  MOA_EXPIRATION = "MOA_EXPIRATION",
  SEMESTER_MILESTONE = "SEMESTER_MILESTONE",
  WORK_SCHEDULE = "WORK_SCHEDULE",
}

export enum CalendarEventColor {
  RED = "#ef4444",
  GRAY = "#6b7280",
  YELLOW = "#eab308",
  GREEN = "#22c55e",
  PURPLE = "#8b5cf6",
  BLUE = "#3b82f6",
  ORANGE = "#f97316",
}

export const EVENT_TYPE_COLOR: Record<CalendarEventType, CalendarEventColor> = {
  [CalendarEventType.SUBMISSION_DEADLINE]: CalendarEventColor.RED,
  [CalendarEventType.HOLIDAY]: CalendarEventColor.GRAY,
  [CalendarEventType.APPROVED_DEVIATION]: CalendarEventColor.YELLOW,
  [CalendarEventType.PROJECTED_COMPLETION]: CalendarEventColor.GREEN,
  [CalendarEventType.MOA_EXPIRATION]: CalendarEventColor.ORANGE,
  [CalendarEventType.SEMESTER_MILESTONE]: CalendarEventColor.PURPLE,
  [CalendarEventType.WORK_SCHEDULE]: CalendarEventColor.BLUE,
};

export interface CalendarDateRange {
  start: Date;
  end: Date;
}

export interface CalendarEvent {
  id: string;
  date: Date;
  endDate?: Date;
  type: CalendarEventType;
  title: string;
  color: CalendarEventColor;
  category: string;
  metadata?: Prisma.InputJsonValue;
  studentProfileId?: string | null;
}

export interface WeekVolumeIndicator {
  weekStart: Date;
  weekEnd: Date;
  deadlineCount: number;
  isHighVolume: boolean;
  studentCount: number;
}

export interface ProjectedCompletionInfo {
  projectedDate: Date;
  remainingHours: number;
  renderedHours: number;
  requiredHours: number;
  avgHoursPerDayNeeded: number;
  workDaysRemaining: number;
  basedOn: {
    currentSchedule: boolean;
    workPlanSchedule: boolean;
    defaultSchedule: boolean;
  };
}

export interface StudentCalendarResult {
  events: CalendarEvent[];
  projectedCompletion: ProjectedCompletionInfo;
  dateRange: CalendarDateRange;
}

export interface FacultyCalendarResult {
  events: CalendarEvent[];
  weekVolumes: WeekVolumeIndicator[];
  assignedStudentIds: string[];
  dateRange: CalendarDateRange;
}

export interface CoordinatorCalendarResult {
  events: CalendarEvent[];
  weekVolumes: WeekVolumeIndicator[];
  clusteredCompletions: Array<{
    weekStart: Date;
    weekEnd: Date;
    projectedCount: number;
    endorsementLetterDemand: boolean;
  }>;
  moaExpiringSoon: Array<{
    id: string;
    companyName: string;
    validTo: Date;
    status: MoaStatus;
    daysUntilExpiry: number;
  }>;
  dateRange: CalendarDateRange;
}

export interface WorkScheduleEntry {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  startHour: number; // 0-23
  startMinute: number; // 0-59
  endHour: number; // 0-23
  endMinute: number; // 0-59
  hoursPerDay: number;
}

export interface ParsedScheduleConfig {
  weeklySchedule: WorkScheduleEntry[];
  weeklyTotalHours: number;
}

// ── Internal Helpers ──────────────────────────────────────────────────────

const DEFAULT_WORK_SCHEDULE: WorkScheduleEntry[] = [
  { dayOfWeek: 1, startHour: 8, startMinute: 0, endHour: 17, endMinute: 0, hoursPerDay: 8 },
  { dayOfWeek: 2, startHour: 8, startMinute: 0, endHour: 17, endMinute: 0, hoursPerDay: 8 },
  { dayOfWeek: 3, startHour: 8, startMinute: 0, endHour: 17, endMinute: 0, hoursPerDay: 8 },
  { dayOfWeek: 4, startHour: 8, startMinute: 0, endHour: 17, endMinute: 0, hoursPerDay: 8 },
  { dayOfWeek: 5, startHour: 8, startMinute: 0, endHour: 17, endMinute: 0, hoursPerDay: 8 },
];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function diffInDays(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const aStart = startOfDay(a).getTime();
  const bStart = startOfDay(b).getTime();
  return Math.round((aStart - bStart) / msPerDay);
}

function getWeekStart(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function getWeekEnd(date: Date): Date {
  return addDays(getWeekStart(date), 6);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWithinRange(date: Date, range: CalendarDateRange): boolean {
  const d = startOfDay(date).getTime();
  const s = startOfDay(range.start).getTime();
  const e = endOfDay(range.end).getTime();
  return d >= s && d <= e;
}

function parseScheduleConfig(scheduleConfig: unknown): ParsedScheduleConfig | null {
  if (!scheduleConfig || typeof scheduleConfig !== "object") return null;

  const cfg = scheduleConfig as Record<string, unknown>;
  const weeklySchedule = cfg.weeklySchedule;

  if (!Array.isArray(weeklySchedule) || weeklySchedule.length === 0) {
    return null;
  }

  const parsedEntries: WorkScheduleEntry[] = [];
  let weeklyTotal = 0;

  for (const entry of weeklySchedule) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as WorkScheduleEntry).dayOfWeek === "number" &&
      typeof (entry as WorkScheduleEntry).hoursPerDay === "number"
    ) {
      const e = entry as WorkScheduleEntry;
      parsedEntries.push(e);
      weeklyTotal += e.hoursPerDay;
    }
  }

  if (parsedEntries.length === 0) return null;

  return { weeklySchedule: parsedEntries, weeklyTotalHours: weeklyTotal };
}

function getEffectiveWorkSchedule(
  workPlanScheduleConfig: unknown
): { schedule: ParsedScheduleConfig; source: "workPlan" | "default" } {
  const parsed = parseScheduleConfig(workPlanScheduleConfig);
  if (parsed) {
    return { schedule: parsed, source: "workPlan" };
  }
  const defaultSchedule: ParsedScheduleConfig = {
    weeklySchedule: DEFAULT_WORK_SCHEDULE,
    weeklyTotalHours: DEFAULT_WORK_SCHEDULE.reduce((sum, e) => sum + e.hoursPerDay, 0),
  };
  return { schedule: defaultSchedule, source: "default" };
}

function buildHolidaySet(
  holidays: Array<{ date: Date; studentProfileId: string | null }>,
  studentProfileId?: string
): Set<string> {
  const set = new Set<string>();
  for (const h of holidays) {
    if (!h.studentProfileId || h.studentProfileId === studentProfileId) {
      set.add(startOfDay(h.date).toISOString());
    }
  }
  return set;
}

function isWorkDay(
  date: Date,
  schedule: ParsedScheduleConfig,
  holidaySet: Set<string>
): boolean {
  if (holidaySet.has(startOfDay(date).toISOString())) return false;
  const dayOfWeek = date.getDay();
  return schedule.weeklySchedule.some((e) => e.dayOfWeek === dayOfWeek);
}

function getHoursForDay(
  date: Date,
  schedule: ParsedScheduleConfig,
  holidaySet: Set<string>
): number {
  if (holidaySet.has(startOfDay(date).toISOString())) return 0;
  const dayOfWeek = date.getDay();
  const entry = schedule.weeklySchedule.find((e) => e.dayOfWeek === dayOfWeek);
  return entry ? entry.hoursPerDay : 0;
}

export function computeWeeklyDeadlines(
  range: CalendarDateRange,
  semesterStart: Date,
  semesterEnd: Date,
  studentProfileIds: string[] | null = null
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  const effectiveStart = new Date(
    Math.max(startOfDay(range.start).getTime(), startOfDay(semesterStart).getTime())
  );
  const effectiveEnd = new Date(
    Math.min(endOfDay(range.end).getTime(), endOfDay(semesterEnd).getTime())
  );

  if (effectiveStart > effectiveEnd) return events;

  const dayCursor = new Date(effectiveStart);

  while (dayCursor <= effectiveEnd) {
    if (dayCursor.getDay() === 6) {
      for (const sid of studentProfileIds ?? [null]) {
        events.push({
          id: `deadline-${dayCursor.toISOString()}-${sid ?? "all"}`,
          date: new Date(dayCursor),
          type: CalendarEventType.SUBMISSION_DEADLINE,
          title: sid ? "Weekly Report Deadline" : "Weekly Report Submission Deadline",
          color: EVENT_TYPE_COLOR[CalendarEventType.SUBMISSION_DEADLINE],
          category: "Deadlines",
          studentProfileId: sid,
        });
      }
    }
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  return events;
}

export function computeMonthlyDeadlines(
  range: CalendarDateRange,
  semesterStart: Date,
  semesterEnd: Date
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  const effectiveStart = new Date(
    Math.max(startOfDay(range.start).getTime(), startOfDay(semesterStart).getTime())
  );
  const effectiveEnd = new Date(
    Math.min(endOfDay(range.end).getTime(), endOfDay(semesterEnd).getTime())
  );

  if (effectiveStart > effectiveEnd) return events;

  const cursor = new Date(effectiveStart);
  cursor.setDate(1);

  while (cursor <= effectiveEnd) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    if (lastDay >= effectiveStart && lastDay <= effectiveEnd) {
      events.push({
        id: `monthly-deadline-${lastDay.toISOString()}`,
        date: new Date(lastDay),
        type: CalendarEventType.SUBMISSION_DEADLINE,
        title: "Monthly Report Submission Deadline",
        color: EVENT_TYPE_COLOR[CalendarEventType.SUBMISSION_DEADLINE],
        category: "Deadlines",
        metadata: { frequency: "monthly" },
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return events;
}

export function calculateProjectedCompletion(
  studentProfile: {
    requiredHours: number;
    renderedHours: number | Prisma.Decimal;
    internshipStartDate: Date | null;
    internshipFaceType?: string | null;
  },
  semester: {
    startDate: Date;
    endDate: Date;
  },
  holidays: Array<{ date: Date; studentProfileId: string | null }>,
  workPlanScheduleConfig: unknown,
  approvedDeviations: Array<{ date: Date; deviationType: DeviationType }>,
  now: Date = new Date()
): ProjectedCompletionInfo {
  const rendered = Number(studentProfile.renderedHours) || 0;
  const required = studentProfile.requiredHours;
  const remaining = Math.max(0, required - rendered);

  const baseStart = studentProfile.internshipStartDate ?? semester.startDate;
  const effectiveStart = new Date(Math.max(startOfDay(baseStart).getTime(), startOfDay(now).getTime()));

  const { schedule, source } = getEffectiveWorkSchedule(workPlanScheduleConfig);
  const holidaySet = buildHolidaySet(holidays);

  const absenceSet = new Set<string>();
  for (const d of approvedDeviations) {
    if (d.deviationType === DeviationType.ABSENCE) {
      absenceSet.add(startOfDay(d.date).toISOString());
    }
  }

  const combinedHolidaySet = new Set([...holidaySet, ...absenceSet]);

  let cumulativeHours = 0;
  let daysRemaining = 0;
  let cursor = startOfDay(effectiveStart);
  let projectedDate = new Date(cursor);
  const semesterEndTime = endOfDay(semester.endDate).getTime();

  while (cumulativeHours < remaining && cursor.getTime() <= semesterEndTime) {
    const isTodayWorkDay = isWorkDay(cursor, schedule, combinedHolidaySet);

    if (isTodayWorkDay) {
      const hours = getHoursForDay(cursor, schedule, combinedHolidaySet);
      if (hours > 0) {
        const need = remaining - cumulativeHours;
        if (cumulativeHours + hours >= need) {
          projectedDate = new Date(cursor);
          cumulativeHours = remaining;
          daysRemaining++;
          break;
        }
        cumulativeHours += hours;
      }
    }

    daysRemaining++;
    projectedDate = new Date(cursor);
    cursor = addDays(cursor, 1);
  }

  if (cumulativeHours < remaining) {
    projectedDate = new Date(semester.endDate);
  }

  const workDaysRemainingCount = Math.max(1, daysRemaining);
  const avgHoursPerDayNeeded = remaining / workDaysRemainingCount;

  return {
    projectedDate,
    remainingHours: Number(remaining.toFixed(2)),
    renderedHours: Number(rendered.toFixed(2)),
    requiredHours: required,
    avgHoursPerDayNeeded: Number(avgHoursPerDayNeeded.toFixed(2)),
    workDaysRemaining: daysRemaining,
    basedOn: {
      currentSchedule: true,
      workPlanSchedule: source === "workPlan",
      defaultSchedule: source === "default",
    },
  };
}

export function buildWeekVolumes(
  range: CalendarDateRange,
  deadlineEvents: CalendarEvent[],
  studentIds: string[]
): WeekVolumeIndicator[] {
  const weekMap = new Map<
    string,
    { weekStart: Date; weekEnd: Date; deadlineCount: number; studentsHit: Set<string> }
  >();

  for (const ev of deadlineEvents) {
    const ws = getWeekStart(ev.date);
    const we = getWeekEnd(ev.date);
    const key = ws.toISOString();

    if (!weekMap.has(key)) {
      weekMap.set(key, {
        weekStart: ws,
        weekEnd: we,
        deadlineCount: 0,
        studentsHit: new Set(),
      });
    }

    const entry = weekMap.get(key)!;
    entry.deadlineCount++;
    if (ev.studentProfileId) {
      entry.studentsHit.add(ev.studentProfileId);
    }
  }

  const values = Array.from(weekMap.values())
    .filter((v) => isWithinRange(v.weekStart, range) || isWithinRange(v.weekEnd, range))
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

  const counts = values.map((v) => v.deadlineCount);
  const threshold =
    counts.length > 0
      ? Math.ceil(counts.reduce((a, b) => a + b, 0) / counts.length * 1.25)
      : 0;

  return values.map((v) => ({
    weekStart: v.weekStart,
    weekEnd: v.weekEnd,
    deadlineCount: v.deadlineCount,
    isHighVolume: v.deadlineCount >= threshold && threshold > 0,
    studentCount: v.studentsHit.size || studentIds.length,
  }));
}

// ── Access Control Primitives ──────────────────────────────────────────────

export class CalendarAccessError extends Error {
  constructor(message = "Calendar access denied") {
    super(message);
    this.name = "CalendarAccessError";
  }
}

async function assertCanAccessStudentCalendar(
  actingUser: { id: string; role: Role },
  studentProfileId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<void> {
  if (actingUser.role === Role.SUPER_ADMIN || actingUser.role === Role.DEPARTMENT_COORDINATOR) {
    return;
  }

  const studentProfile = await client.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { userId: true, classGroupId: true, semesterId: true },
  });

  if (!studentProfile) {
    throw new CalendarAccessError("Student profile not found");
  }

  if (actingUser.role === Role.STUDENT_INTERN) {
    if (studentProfile.userId !== actingUser.id) {
      throw new CalendarAccessError();
    }
    return;
  }

  if (actingUser.role === Role.FACULTY_ADVISER) {
    const link = await client.facultyClassGroup.findFirst({
      where: {
        facultyId: actingUser.id,
        classGroupId: studentProfile.classGroupId,
        semesterId: studentProfile.semesterId,
      },
      select: { id: true },
    });
    if (!link) {
      throw new CalendarAccessError();
    }
    return;
  }

  throw new CalendarAccessError();
}

async function assertCanAccessFacultyCalendar(
  actingUser: { id: string; role: Role },
  facultyUserId: string
): Promise<void> {
  if (actingUser.role === Role.SUPER_ADMIN || actingUser.role === Role.DEPARTMENT_COORDINATOR) {
    return;
  }
  if (actingUser.role === Role.FACULTY_ADVISER && actingUser.id === facultyUserId) {
    return;
  }
  throw new CalendarAccessError();
}

async function assertCanAccessCoordinatorCalendar(actingUser: {
  id: string;
  role: Role;
}): Promise<void> {
  if (actingUser.role === Role.SUPER_ADMIN || actingUser.role === Role.DEPARTMENT_COORDINATOR) {
    return;
  }
  throw new CalendarAccessError();
}

// ── FR-CAL-01: Unified Calendar Base ─────────────────────────────────────

export interface UnifiedCalendarBaseParams {
  range: CalendarDateRange;
  semesterId?: string;
  studentProfileIds?: string[];
  includeHolidays?: boolean;
  includeApprovedDeviations?: boolean;
  includeDeadlines?: boolean;
  includeProjectedCompletions?: boolean;
}

export async function getUnifiedCalendarBase(
  params: UnifiedCalendarBaseParams,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<{
  events: CalendarEvent[];
  activeSemester: { id: string; startDate: Date; endDate: Date; name: string } | null;
}> {
  const {
    range,
    semesterId,
    studentProfileIds,
    includeHolidays = true,
    includeApprovedDeviations = true,
    includeDeadlines = true,
    includeProjectedCompletions = true,
  } = params;

  const events: CalendarEvent[] = [];

  const semesterWhere: Prisma.SemesterWhereInput = semesterId
    ? { id: semesterId }
    : { isActive: true };

  const semester = await client.semester.findFirst({
    where: semesterWhere,
    select: { id: true, startDate: true, endDate: true, name: true },
  });

  if (!semester) {
    return { events, activeSemester: null };
  }

  if (includeDeadlines) {
    const weeklyDeadlines = computeWeeklyDeadlines(
      range,
      semester.startDate,
      semester.endDate,
      studentProfileIds
    );
    const monthlyDeadlines = computeMonthlyDeadlines(range, semester.startDate, semester.endDate);
    events.push(...weeklyDeadlines, ...monthlyDeadlines);

    events.push({
      id: `milestone-start-${semester.id}`,
      date: new Date(semester.startDate),
      type: CalendarEventType.SEMESTER_MILESTONE,
      title: `${semester.name} Start`,
      color: EVENT_TYPE_COLOR[CalendarEventType.SEMESTER_MILESTONE],
      category: "Milestones",
    });
    events.push({
      id: `milestone-end-${semester.id}`,
      date: new Date(semester.endDate),
      type: CalendarEventType.SEMESTER_MILESTONE,
      title: `${semester.name} End`,
      color: EVENT_TYPE_COLOR[CalendarEventType.SEMESTER_MILESTONE],
      category: "Milestones",
    });
  }

  if (includeHolidays) {
    const holidayWhere: Prisma.HolidayCalendarEntryWhereInput = {
      date: { gte: range.start, lte: range.end },
      OR: [
        { semesterId: semester.id },
        { studentProfileId: studentProfileIds ? { in: studentProfileIds } : undefined },
      ],
    };

    const holidays = await client.holidayCalendarEntry.findMany({
      where: holidayWhere,
      select: { id: true, date: true, name: true, holidayType: true, studentProfileId: true },
    });

    for (const h of holidays) {
      events.push({
        id: `holiday-${h.id}`,
        date: new Date(h.date),
        type: CalendarEventType.HOLIDAY,
        title: `${h.holidayType === HolidayType.NATIONAL ? "National" : "Regional"} Holiday: ${h.name}`,
        color: EVENT_TYPE_COLOR[CalendarEventType.HOLIDAY],
        category: "Holidays",
        studentProfileId: h.studentProfileId,
        metadata: { holidayType: h.holidayType },
      });
    }
  }

  if (includeApprovedDeviations) {
    const deviationWhere: Prisma.DeviationReportWhereInput = {
      date: { gte: range.start, lte: range.end },
      validationStatus: "VALIDATED",
    };
    if (studentProfileIds && studentProfileIds.length > 0) {
      deviationWhere.studentProfileId = { in: studentProfileIds };
    }

    const deviations = await client.deviationReport.findMany({
      where: deviationWhere,
      select: {
        id: true,
        date: true,
        deviationType: true,
        reason: true,
        studentProfileId: true,
      },
    });

    for (const d of deviations) {
      events.push({
        id: `deviation-${d.id}`,
        date: new Date(d.date),
        type: CalendarEventType.APPROVED_DEVIATION,
        title: `Approved ${d.deviationType.charAt(0)}${d.deviationType.slice(1).toLowerCase()}`,
        color: EVENT_TYPE_COLOR[CalendarEventType.APPROVED_DEVIATION],
        category: "Deviations",
        studentProfileId: d.studentProfileId,
        metadata: { reason: d.reason, deviationType: d.deviationType },
      });
    }
  }

  if (includeProjectedCompletions && studentProfileIds && studentProfileIds.length > 0) {
    for (const sid of studentProfileIds) {
      const profile = await client.studentProfile.findUnique({
        where: { id: sid },
        select: {
          requiredHours: true,
          renderedHours: true,
          internshipStartDate: true,
          internshipFaceType: true,
          userId: true,
        },
      });
      if (!profile) continue;

      const workPlan = await client.workPlan.findFirst({
        where: { studentProfileId: sid },
        orderBy: { createdAt: "desc" },
        select: { scheduleConfig: true },
      });

      const relevantHolidays = await client.holidayCalendarEntry.findMany({
        where: {
          OR: [
            { semesterId: semester.id },
            { studentProfileId: sid },
          ],
        },
        select: { date: true, studentProfileId: true },
      });

      const relevantDeviations = await client.deviationReport.findMany({
        where: {
          studentProfileId: sid,
          validationStatus: "VALIDATED",
          date: { gte: new Date() },
        },
        select: { date: true, deviationType: true },
      });

      const projection = calculateProjectedCompletion(
        profile,
        semester,
        relevantHolidays,
        workPlan?.scheduleConfig,
        relevantDeviations
      );

      if (isWithinRange(projection.projectedDate, range)) {
        events.push({
          id: `projected-completion-${sid}`,
          date: new Date(projection.projectedDate),
          type: CalendarEventType.PROJECTED_COMPLETION,
          title: "Projected OJT Completion",
          color: EVENT_TYPE_COLOR[CalendarEventType.PROJECTED_COMPLETION],
          category: "Milestones",
          studentProfileId: sid,
          metadata: projection as unknown as Prisma.InputJsonValue,
        });
      }
    }
  }

  return { events, activeSemester: semester };
}

// ── FR-CAL-02: Student Calendar ───────────────────────────────────────────

export interface StudentCalendarParams {
  actingUser: { id: string; role: Role };
  studentProfileId: string;
  range?: CalendarDateRange;
}

export async function getStudentCalendar(
  params: StudentCalendarParams,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<StudentCalendarResult> {
  await assertCanAccessStudentCalendar(params.actingUser, params.studentProfileId, client);

  const profile = await client.studentProfile.findUniqueOrThrow({
    where: { id: params.studentProfileId },
    select: {
      requiredHours: true,
      renderedHours: true,
      internshipStartDate: true,
      internshipFaceType: true,
      semesterId: true,
      userId: true,
    },
  });

  const semester = await client.semester.findUniqueOrThrow({
    where: { id: profile.semesterId },
    select: { id: true, startDate: true, endDate: true, name: true },
  });

  const today = new Date();
  const defaultStart = addDays(
    profile.internshipStartDate ?? semester.startDate,
    -7
  );
  const defaultEnd = addDays(semester.endDate, 14);

  const range: CalendarDateRange = params.range ?? {
    start: new Date(Math.min(defaultStart.getTime(), today.getTime())),
    end: defaultEnd,
  };

  const baseResult = await getUnifiedCalendarBase(
    {
      range,
      semesterId: semester.id,
      studentProfileIds: [params.studentProfileId],
      includeHolidays: true,
      includeApprovedDeviations: true,
      includeDeadlines: true,
      includeProjectedCompletions: true,
    },
    client
  );

  const events = [...baseResult.events];

  const workPlan = await client.workPlan.findFirst({
    where: { studentProfileId: params.studentProfileId },
    orderBy: { createdAt: "desc" },
    select: { scheduleConfig: true },
  });

  const { schedule } = getEffectiveWorkSchedule(workPlan?.scheduleConfig);

  const holidayEntries = await client.holidayCalendarEntry.findMany({
    where: {
      OR: [
        { semesterId: semester.id },
        { studentProfileId: params.studentProfileId },
      ],
    },
    select: { date: true, studentProfileId: true },
  });
  const holidaySet = buildHolidaySet(holidayEntries, params.studentProfileId);

  const cursor = startOfDay(new Date(range.start));
  while (cursor <= range.end) {
    if (isWorkDay(cursor, schedule, holidaySet)) {
      const hours = getHoursForDay(cursor, schedule, holidaySet);
      if (hours > 0) {
        const entry = schedule.weeklySchedule.find((e) => e.dayOfWeek === cursor.getDay());
        events.push({
          id: `work-${params.studentProfileId}-${cursor.toISOString()}`,
          date: new Date(cursor),
          type: CalendarEventType.WORK_SCHEDULE,
          title: `Work Day (${hours}h) — ${
            entry
              ? `${String(entry.startHour).padStart(2, "0")}:${String(
                  entry.startMinute
                ).padStart(2, "0")}–${String(entry.endHour).padStart(2, "0")}:${String(
                  entry.endMinute
                ).padStart(2, "0")}`
              : `${hours} hours`
          }`,
          color: EVENT_TYPE_COLOR[CalendarEventType.WORK_SCHEDULE],
          category: "Work Schedule",
          studentProfileId: params.studentProfileId,
          metadata: { hoursPerDay: hours },
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const relevantDeviations = await client.deviationReport.findMany({
    where: {
      studentProfileId: params.studentProfileId,
      validationStatus: "VALIDATED",
    },
    select: { date: true, deviationType: true },
  });

  const projectedCompletion = calculateProjectedCompletion(
    profile,
    semester,
    holidayEntries,
    workPlan?.scheduleConfig,
    relevantDeviations
  );

  return {
    events: events.sort((a, b) => a.date.getTime() - b.date.getTime()),
    projectedCompletion,
    dateRange: range,
  };
}

// ── FR-CAL-03: Faculty Calendar ───────────────────────────────────────────

export interface FacultyCalendarParams {
  actingUser: { id: string; role: Role };
  facultyUserId: string;
  range?: CalendarDateRange;
}

export async function getFacultyCalendar(
  params: FacultyCalendarParams,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<FacultyCalendarResult> {
  await assertCanAccessFacultyCalendar(params.actingUser, params.facultyUserId);

  const activeSemester = await client.semester.findFirst({
    where: { isActive: true },
    select: { id: true, startDate: true, endDate: true, name: true },
  });

  if (!activeSemester) {
    return {
      events: [],
      weekVolumes: [],
      assignedStudentIds: [],
      dateRange: params.range ?? { start: new Date(), end: new Date() },
    };
  }

  const defaultStart = addDays(activeSemester.startDate, -7);
  const defaultEnd = addDays(activeSemester.endDate, 14);
  const range: CalendarDateRange = params.range ?? { start: defaultStart, end: defaultEnd };

  const facultyGroups = await client.facultyClassGroup.findMany({
    where: {
      facultyId: params.facultyUserId,
      semesterId: activeSemester.id,
    },
    select: { classGroupId: true },
  });

  const classGroupIds = facultyGroups.map((g) => g.classGroupId);

  const assignedStudents = await client.studentProfile.findMany({
    where: {
      classGroupId: { in: classGroupIds },
      semesterId: activeSemester.id,
      deletedAt: null,
    },
    select: { id: true },
  });

  const studentProfileIds = assignedStudents.map((s) => s.id);

  const baseResult = await getUnifiedCalendarBase(
    {
      range,
      semesterId: activeSemester.id,
      studentProfileIds,
      includeHolidays: true,
      includeApprovedDeviations: true,
      includeDeadlines: true,
      includeProjectedCompletions: true,
    },
    client
  );

  const events = [...baseResult.events];

  const deadlineEvents = events.filter(
    (e) => e.type === CalendarEventType.SUBMISSION_DEADLINE
  );

  const weekVolumes = buildWeekVolumes(range, deadlineEvents, studentProfileIds);

  return {
    events: events.sort((a, b) => a.date.getTime() - b.date.getTime()),
    weekVolumes,
    assignedStudentIds: studentProfileIds,
    dateRange: range,
  };
}

// ── FR-CAL-04: Coordinator Calendar ───────────────────────────────────────

export interface CoordinatorCalendarParams {
  actingUser: { id: string; role: Role };
  range?: CalendarDateRange;
}

export async function getCoordinatorCalendar(
  params: CoordinatorCalendarParams,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<CoordinatorCalendarResult> {
  await assertCanAccessCoordinatorCalendar(params.actingUser);

  const activeSemester = await client.semester.findFirst({
    where: { isActive: true },
    select: { id: true, startDate: true, endDate: true, name: true },
  });

  if (!activeSemester) {
    return {
      events: [],
      weekVolumes: [],
      clusteredCompletions: [],
      moaExpiringSoon: [],
      dateRange: params.range ?? { start: new Date(), end: new Date() },
    };
  }

  const defaultStart = addDays(activeSemester.startDate, -14);
  const defaultEnd = addDays(activeSemester.endDate, 60);
  const range: CalendarDateRange = params.range ?? { start: defaultStart, end: defaultEnd };

  const allStudents = await client.studentProfile.findMany({
    where: {
      semesterId: activeSemester.id,
      deletedAt: null,
    },
    select: { id: true },
  });

  const studentProfileIds = allStudents.map((s) => s.id);

  const baseResult = await getUnifiedCalendarBase(
    {
      range,
      semesterId: activeSemester.id,
      studentProfileIds,
      includeHolidays: true,
      includeApprovedDeviations: true,
      includeDeadlines: true,
      includeProjectedCompletions: true,
    },
    client
  );

  const events = [...baseResult.events];

  const today = new Date();
  const ninetyDaysOut = addDays(today, 90);

  const expiringMoas = await client.moaRecord.findMany({
    where: {
      validTo: { gte: today, lte: ninetyDaysOut },
      status: { in: [MoaStatus.APPROVED_ACTIVE, MoaStatus.EXPIRING] },
    },
    select: {
      id: true,
      validTo: true,
      status: true,
      company: { select: { name: true } },
    },
    orderBy: { validTo: "asc" },
  });

  const moaExpiringSoon = expiringMoas.map((m) => {
    events.push({
      id: `moa-expiry-${m.id}`,
      date: new Date(m.validTo),
      type: CalendarEventType.MOA_EXPIRATION,
      title: `MOA Expiration: ${m.company.name}`,
      color: EVENT_TYPE_COLOR[CalendarEventType.MOA_EXPIRATION],
      category: "MOA",
      metadata: { status: m.status, companyName: m.company.name },
    });

    return {
      id: m.id,
      companyName: m.company.name,
      validTo: new Date(m.validTo),
      status: m.status,
      daysUntilExpiry: diffInDays(new Date(m.validTo), today),
    };
  });

  const projectedCompletionEvents = events.filter(
    (e) => e.type === CalendarEventType.PROJECTED_COMPLETION
  );

  const completionClusterMap = new Map<
    string,
    { weekStart: Date; weekEnd: Date; projectedCount: number }
  >();

  for (const ev of projectedCompletionEvents) {
    const ws = getWeekStart(ev.date);
    const we = getWeekEnd(ev.date);
    const key = ws.toISOString();

    if (!completionClusterMap.has(key)) {
      completionClusterMap.set(key, { weekStart: ws, weekEnd: we, projectedCount: 0 });
    }
    completionClusterMap.get(key)!.projectedCount++;
  }

  const clusteredCompletions = Array.from(completionClusterMap.values())
    .filter((c) => isWithinRange(c.weekStart, range) || isWithinRange(c.weekEnd, range))
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
    .map((c) => ({
      ...c,
      endorsementLetterDemand: c.projectedCount >= 3,
    }));

  const deadlineEvents = events.filter(
    (e) => e.type === CalendarEventType.SUBMISSION_DEADLINE
  );

  const weekVolumes = buildWeekVolumes(range, deadlineEvents, studentProfileIds);

  return {
    events: events.sort((a, b) => a.date.getTime() - b.date.getTime()),
    weekVolumes,
    clusteredCompletions,
    moaExpiringSoon,
    dateRange: range,
  };
}
