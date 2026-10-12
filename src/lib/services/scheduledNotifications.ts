import { DataRequestStatus, Prisma, WeeklyReportStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { notify } from "@/lib/services/notify";
import { getDepartmentStaffIds, getSuperAdminIds } from "@/lib/services/notificationRecipients";
import { getExpiringMoaRecords } from "@/lib/services/companyService";
import { isAwaitingReview } from "@/lib/services/weeklyReportService";
import {
  addDays,
  getWeekStartMonday,
  getWeeklyReportDueInstant,
  toDateKey,
} from "@/lib/utils/reportDeadline";

const HOURS_KEY = "notification:deadline_reminder_hours";
const MOA_KEY = "notification:moa_warning_days";
export const DSAR_REMINDER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULTS = { deadlineReminderHours: [48, 24], moaWarningDays: 30 };

// The job runs once a day at 08:00 Manila and reports are due Tuesday 23:59
// Manila, so the closest a run ever gets to a deadline is ~16h. A smaller
// window could never fire.
export const MIN_REMINDER_HOURS = 16;

export const notificationSettingsSchema = z.object({
  deadlineReminderHours: z
    .array(z.number().int().min(MIN_REMINDER_HOURS).max(168))
    .min(1)
    .max(3)
    .refine((a) => new Set(a).size === a.length, "Reminder hours must be distinct"),
  moaWarningDays: z.number().int().min(1).max(180),
});

// FR-NT-02: the only place defaults live.
export async function getNotificationSettings() {
  const [hours, moa] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { configKey: HOURS_KEY },
      select: { configValue: true },
    }),
    prisma.systemConfig.findUnique({
      where: { configKey: MOA_KEY },
      select: { configValue: true },
    }),
  ]);
  const parsed = notificationSettingsSchema.safeParse({
    deadlineReminderHours: hours?.configValue ?? DEFAULTS.deadlineReminderHours,
    moaWarningDays: moa?.configValue ?? DEFAULTS.moaWarningDays,
  });
  if (!parsed.success) {
    console.error("Stored notification settings are invalid; using defaults", {
      issues: parsed.error.issues,
    });
    return DEFAULTS;
  }
  return parsed.data;
}

export async function setNotificationSettings(input: unknown, actingUserId: string) {
  const settings = notificationSettingsSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    for (const [configKey, configValue] of [
      [HOURS_KEY, settings.deadlineReminderHours],
      [MOA_KEY, settings.moaWarningDays],
    ] as const) {
      await tx.systemConfig.upsert({
        where: { configKey },
        create: {
          configKey,
          configValue: configValue as Prisma.InputJsonValue,
          updatedBy: actingUserId,
        },
        update: { configValue: configValue as Prisma.InputJsonValue, updatedBy: actingUserId },
      });
    }
    await logEvent(
      {
        userId: actingUserId,
        action: "NOTIFICATION_SETTINGS_UPDATED",
        entityType: "SystemConfig",
        detail: settings,
      },
      tx
    );
  });
  return settings;
}

// Idempotency (re-runs, platform retries): a reminder with this dedupe key
// was already recorded. userId narrows per-student reminders; staff-wide
// warnings (MOA) dedupe on the key alone.
async function alreadySent(trigger: string, dedupeKey: string, userId?: string) {
  return prisma.notification.findFirst({
    where: {
      ...(userId ? { userId } : {}),
      triggerType: trigger,
      payload: { path: ["dedupeKey"], equals: dedupeKey },
    },
    select: { id: true },
  });
}

// Reports are due the Tuesday after their week, so nothing older than this
// can still be inside a reminder window.
const SCAN_BACK_DAYS = 10;

// NFR-DP-07: nudge Super Admins about open data requests due within
// DSAR_REMINDER_DAYS (overdue included), once per request per day. Returns the
// number of reminders delivered in-app.
export async function remindDueDataRequests(now: Date): Promise<number> {
  const due = await prisma.dataRequest.findMany({
    where: {
      status: DataRequestStatus.OPEN,
      dueAt: { lte: new Date(now.getTime() + DSAR_REMINDER_DAYS * DAY_MS) },
    },
    orderBy: { dueAt: "asc" },
    select: { id: true, dueAt: true, user: { select: { email: true } } },
  });
  if (due.length === 0) return 0;

  const adminIds = await getSuperAdminIds();
  let sent = 0;
  for (const request of due) {
    const dedupeKey = `dsar:${request.id}:${toDateKey(now)}`;
    if (await alreadySent("DSAR_DUE", dedupeKey)) continue;
    const overdue = request.dueAt.getTime() < now.getTime();
    const result = await notify({
      userIds: adminIds,
      trigger: "DSAR_DUE",
      title: overdue ? "Data request overdue" : "Data request due soon",
      body: `${request.user.email}'s request ${overdue ? "was" : "is"} due ${toDateKey(request.dueAt)}.`,
      link: "/admin/export-center#data-requests",
      dedupeKey,
    });
    if (result.inApp > 0) sent += 1;
  }
  return sent;
}

interface ReminderTarget {
  profileId: string;
  userId: string;
  weekStart: Date;
  weekEnd: Date;
}

// FR-NT-05: one daily run (Hobby tier). Each configured window (e.g. 48h,
// 24h) is evaluated as "due within the next N hours"; the reminder for the
// tightest matching window is sent once per student-week per window.
// Errors are isolated per student and collected so the route can report them.
export async function runDailyNotifications(now: Date) {
  const settings = await getNotificationSettings();
  // Ascending: the first window that still contains `hoursLeft` is the
  // tightest one (e.g. [24, 48]: due in 40h → 48, due in 20h → 24).
  const windows = [...settings.deadlineReminderHours].sort((a, b) => a - b);
  const result = { deadlineReminders: 0, moaWarnings: 0, dsarReminders: 0, errors: [] as string[] };

  const openReports = await prisma.weeklyReport.findMany({
    where: {
      status: { in: [WeeklyReportStatus.PENDING, WeeklyReportStatus.RETURNED] },
      weekEnd: { gte: addDays(now, -SCAN_BACK_DAYS) },
    },
    select: {
      id: true,
      weekStart: true,
      weekEnd: true,
      status: true,
      revisionHistory: true,
      studentProfile: { select: { id: true, userId: true } },
    },
  });

  const targets: ReminderTarget[] = openReports
    .filter((report) => !isAwaitingReview(report)) // submitted — nothing to remind about
    .map((report) => ({
      profileId: report.studentProfile.id,
      userId: report.studentProfile.userId,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
    }));

  // Deployed students who haven't opened last week's report at all still
  // owe it — without this they would never be reminded.
  const lastWeekStart = addDays(getWeekStartMonday(now), -7);
  const lastWeekEnd = addDays(lastWeekStart, 6);
  const notStarted = await prisma.studentProfile.findMany({
    where: {
      deletedAt: null,
      companyId: { not: null },
      internshipStartDate: { lte: lastWeekEnd },
      weeklyReports: { none: { weekStart: lastWeekStart } },
    },
    select: { id: true, userId: true },
  });
  for (const profile of notStarted) {
    targets.push({
      profileId: profile.id,
      userId: profile.userId,
      weekStart: lastWeekStart,
      weekEnd: lastWeekEnd,
    });
  }

  for (const target of targets) {
    try {
      const hoursLeft =
        (getWeeklyReportDueInstant(target.weekEnd).getTime() - now.getTime()) / 3_600_000;
      if (hoursLeft <= 0) continue;
      const window = windows.find((w) => hoursLeft <= w);
      if (window === undefined) continue;

      // Keyed on student + week (not report id) so creating the report row
      // after a "not started" reminder doesn't earn a second one.
      const dedupeKey = `deadline:${target.profileId}:${toDateKey(target.weekStart)}:${window}`;
      if (await alreadySent("DEADLINE_REMINDER", dedupeKey, target.userId)) continue;

      const sent = await notify({
        userIds: [target.userId],
        trigger: "DEADLINE_REMINDER",
        title: `Weekly report due in about ${Math.ceil(hoursLeft)} hours`,
        body: "Submit your weekly report by Tuesday 11:59 PM to avoid a late flag.",
        link: `/students/${target.profileId}/weekly-reports`,
        email: true,
        dedupeKey,
      });
      if (sent.inApp > 0) result.deadlineReminders += 1;
    } catch (error) {
      console.error("Deadline reminder failed", { profileId: target.profileId, error });
      result.errors.push(`deadline:${target.profileId}`);
    }
  }

  try {
    const expiring = await getExpiringMoaRecords(settings.moaWarningDays);
    const moaKey = `moa:${toDateKey(now)}`;
    if (expiring.length > 0 && !(await alreadySent("MOA_EXPIRING", moaKey))) {
      const sent = await notify({
        userIds: await getDepartmentStaffIds(),
        trigger: "MOA_EXPIRING",
        title: `${expiring.length} MOA(s) expiring within ${settings.moaWarningDays} days`,
        body: "Review the companies list to start renewals.",
        link: "/companies",
        email: true,
        dedupeKey: moaKey,
      });
      if (sent.inApp > 0) result.moaWarnings = expiring.length;
    }
  } catch (error) {
    console.error("MOA expiry warning failed", { error });
    result.errors.push("moa");
  }

  try {
    result.dsarReminders = await remindDueDataRequests(now);
  } catch (error) {
    console.error("DSAR due reminder failed", { error });
    result.errors.push("dsar");
  }

  return result;
}
