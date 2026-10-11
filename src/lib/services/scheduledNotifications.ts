import { Prisma, WeeklyReportStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { notify } from "@/lib/services/notify";
import { getDepartmentStaffIds } from "@/lib/services/notificationRecipients";
import { getExpiringMoaRecords } from "@/lib/services/companyService";
import { isAwaitingReview } from "@/lib/services/weeklyReportService";
import { getWeeklyReportDueInstant } from "@/lib/utils/reportDeadline";

const HOURS_KEY = "notification:deadline_reminder_hours";
const MOA_KEY = "notification:moa_warning_days";
const DEFAULTS = { deadlineReminderHours: [48, 24], moaWarningDays: 30 };

export const notificationSettingsSchema = z.object({
  deadlineReminderHours: z
    .array(z.number().int().min(1).max(168))
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
  return parsed.success ? parsed.data : DEFAULTS;
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

// FR-NT-05: one daily run (Hobby tier). Each configured window (e.g. 48h,
// 24h) is evaluated as "due within the next N hours"; the reminder for the
// largest matching window is sent once per report per window.
export async function runDailyNotifications(now: Date) {
  const settings = await getNotificationSettings();
  // Ascending: the first window that still contains `hoursLeft` is the
  // tightest one (e.g. [24, 48]: due in 40h → 48, due in 20h → 24).
  const windows = [...settings.deadlineReminderHours].sort((a, b) => a - b);
  const result = { deadlineReminders: 0, moaWarnings: 0 };

  const openReports = await prisma.weeklyReport.findMany({
    where: { status: { in: [WeeklyReportStatus.PENDING, WeeklyReportStatus.RETURNED] } },
    select: {
      id: true,
      weekStart: true,
      weekEnd: true,
      status: true,
      revisionHistory: true,
      studentProfile: { select: { id: true, userId: true } },
    },
  });

  for (const report of openReports) {
    if (isAwaitingReview(report)) continue; // submitted — nothing to remind about
    const hoursLeft =
      (getWeeklyReportDueInstant(report.weekEnd).getTime() - now.getTime()) / 3_600_000;
    if (hoursLeft <= 0) continue;
    const window = windows.find((w) => hoursLeft <= w);
    if (window === undefined) continue;

    const dedupeKey = `deadline:${report.id}:${window}`;
    if (await alreadySent("DEADLINE_REMINDER", dedupeKey, report.studentProfile.userId)) continue;

    await notify({
      userIds: [report.studentProfile.userId],
      trigger: "DEADLINE_REMINDER",
      title: `Weekly report due in about ${Math.ceil(hoursLeft)} hours`,
      body: "Submit your weekly report by Tuesday 11:59 PM to avoid a late flag.",
      link: `/students/${report.studentProfile.id}/weekly-reports`,
      email: true,
      dedupeKey,
    });
    result.deadlineReminders += 1;
  }

  const expiring = await getExpiringMoaRecords(settings.moaWarningDays);
  const moaKey = `moa:${now.toISOString().slice(0, 10)}`;
  if (expiring.length > 0 && !(await alreadySent("MOA_EXPIRING", moaKey))) {
    await notify({
      userIds: await getDepartmentStaffIds(),
      trigger: "MOA_EXPIRING",
      title: `${expiring.length} MOA(s) expiring within ${settings.moaWarningDays} days`,
      body: "Review the companies list to start renewals.",
      link: "/companies",
      email: true,
      dedupeKey: moaKey,
    });
    result.moaWarnings = expiring.length;
  }

  return result;
}
