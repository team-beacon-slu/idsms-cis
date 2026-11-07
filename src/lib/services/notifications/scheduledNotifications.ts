import {
  ChecklistStatus,
  DataRequestStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  ValidationStatus,
  WeeklyReportStatus,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { isEmailConfigured, notify, sendEmail } from "@/lib/services/notifications/notify";
import { NotificationEmail } from "@/components/emails/notification-email";
import {
  getDepartmentStaffIds,
  getSuperAdminIds,
} from "@/lib/services/notifications/notificationRecipients";
import { runRetentionScan } from "@/lib/services/privacy/retentionService";
import { getExpiringMoaRecords } from "@/lib/services/predeployment/companyService";
import { formatManilaDate, manilaDayDiff } from "@/lib/utils/excelExport";
import { getLatestSubmission, isAwaitingReview } from "@/lib/services/reports/weeklyReportService";
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
    // Same Manila-calendar-day rule as the Export Center badge.
    const overdue = manilaDayDiff(request.dueAt, now) < 0;
    const result = await notify({
      userIds: adminIds,
      trigger: "DSAR_DUE",
      title: overdue ? "Data request overdue" : "Data request due soon",
      body: `${request.user.email}'s request ${overdue ? "was" : "is"} due ${formatManilaDate(request.dueAt)}.`,
      link: "/admin/export-center#data-requests",
      dedupeKey,
    });
    if (result.inApp > 0) sent += 1;
  }
  return sent;
}

// Decision D1 (5 Nov 2026): one 08:00 email per adviser instead of one per submission.
// Counts what waits on them (submitted weeks, time requests, checklist items marked uploaded) and how long the oldest
// week has waited; nothing is sent when nothing waits. Once per adviser per day.
export const OVERDUE_REVIEW_DAYS = 3;

export async function sendReviewDigests(now: Date): Promise<number> {
  const pairs = await prisma.facultyClassGroup.findMany({
    where: { semester: { archivedAt: null }, faculty: { isActive: true, deletedAt: null } },
    select: { facultyId: true, classGroupId: true, semesterId: true },
  });
  if (pairs.length === 0) return 0;
  const groupKey = (classGroupId: string | null, semesterId: string | null) =>
    `${classGroupId}:${semesterId}`;
  const advisersOf = new Map<string, string[]>();
  for (const p of pairs) {
    const key = groupKey(p.classGroupId, p.semesterId);
    advisersOf.set(key, [...(advisersOf.get(key) ?? []), p.facultyId]);
  }
  const inGroups = {
    deletedAt: null,
    OR: pairs.map((p) => ({ classGroupId: p.classGroupId, semesterId: p.semesterId })),
  };
  const [reports, requests, uploads] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: { status: WeeklyReportStatus.PENDING, studentProfile: inGroups },
      select: {
        status: true,
        revisionHistory: true,
        studentProfile: { select: { classGroupId: true, semesterId: true } },
      },
    }),
    prisma.deviationReport.findMany({
      where: { validationStatus: ValidationStatus.PENDING, studentProfile: inGroups },
      select: { studentProfile: { select: { classGroupId: true, semesterId: true } } },
    }),
    prisma.preDeploymentChecklistItem.findMany({
      where: {
        status: ChecklistStatus.PENDING,
        uploadedAt: { not: null },
        archivedAt: null,
        studentProfile: inGroups,
      },
      select: { studentProfile: { select: { classGroupId: true, semesterId: true } } },
    }),
  ]);

  type Tally = { weeks: number; requests: number; uploads: number; oldest: Date | null };
  const tally = new Map<string, Tally>();
  const bump = (
    profile: { classGroupId: string | null; semesterId: string | null },
    add: (t: Tally) => void
  ) => {
    for (const facultyId of advisersOf.get(groupKey(profile.classGroupId, profile.semesterId)) ??
      []) {
      const t = tally.get(facultyId) ?? { weeks: 0, requests: 0, uploads: 0, oldest: null };
      add(t);
      tally.set(facultyId, t);
    }
  };
  for (const r of reports.filter(isAwaitingReview)) {
    const stamp = getLatestSubmission(r.revisionHistory)?.timestamp;
    const submitted = stamp ? new Date(stamp) : null;
    bump(r.studentProfile, (t) => {
      t.weeks += 1;
      if (submitted && (!t.oldest || submitted < t.oldest)) t.oldest = submitted;
    });
  }
  for (const r of requests) bump(r.studentProfile, (t) => (t.requests += 1));
  for (const r of uploads) bump(r.studentProfile, (t) => (t.uploads += 1));

  let sent = 0;
  for (const [facultyId, t] of tally) {
    const dedupeKey = `digest:${facultyId}:${toDateKey(now)}`;
    if (await alreadySent("REVIEW_DIGEST", dedupeKey, facultyId)) continue;
    const days = t.oldest ? Math.floor((now.getTime() - t.oldest.getTime()) / DAY_MS) : 0;
    const parts = [
      t.weeks && `${t.weeks} weekly report${t.weeks === 1 ? "" : "s"}`,
      t.requests && `${t.requests} time request${t.requests === 1 ? "" : "s"}`,
      t.uploads && `${t.uploads} checklist item${t.uploads === 1 ? "" : "s"}`,
    ].filter(Boolean) as string[];
    const list =
      parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
    const result = await notify({
      userIds: [facultyId],
      trigger: "REVIEW_DIGEST",
      title: `Waiting for your review: ${list}`,
      body:
        t.weeks > 0
          ? `The oldest week has waited ${days} day${days === 1 ? "" : "s"}${days >= OVERDUE_REVIEW_DAYS ? " (overdue)" : ""}.`
          : "Open your review queue to decide them.",
      link: "/review-queue",
      email: true,
      dedupeKey,
    });
    if (result.inApp > 0) sent += 1;
  }
  return sent;
}

// Efficiency item 34: failed emails of the last 7 days, for Settings and the retry.
export const RETRY_EMAIL_DAYS = 7;
const failedEmailsSince = (now: Date) => ({
  channel: NotificationChannel.EMAIL,
  status: NotificationStatus.FAILED,
  payload: { path: ["failedAt"], gte: now.getTime() - RETRY_EMAIL_DAYS * DAY_MS },
});

export const countFailedEmails = (now = new Date()) =>
  prisma.notification.count({ where: failedEmailsSince(now) });

// The daily cron sends each retryable failed email once more (plain notifications only:
// reset and other custom emails never store their body). 50 a run keeps the cron short.
export async function retryFailedEmails(now: Date): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const failed = await prisma.notification.findMany({
    where: { ...failedEmailsSince(now), user: { isActive: true, deletedAt: null } },
    take: 50,
    select: { id: true, payload: true, user: { select: { email: true } } },
  });
  let sent = 0;
  for (const n of failed) {
    const p = n.payload as { title?: unknown; body?: unknown; link?: unknown } | null;
    if (typeof p?.title !== "string" || typeof p.body !== "string") continue;
    const link = typeof p.link === "string" ? p.link : null;
    try {
      await sendEmail(
        n.user.email,
        p.title,
        NotificationEmail({ title: p.title, body: p.body, link: link ?? undefined }),
        [p.title, p.body, link ? `${process.env.NEXTAUTH_URL ?? ""}${link}` : ""]
          .filter(Boolean)
          .join("\n\n")
      );
    } catch (error) {
      console.error("Email retry failed", { notificationId: n.id, error });
      continue;
    }
    await prisma.notification.update({
      where: { id: n.id },
      data: { status: NotificationStatus.SENT, sentAt: now },
    });
    sent += 1;
  }
  return sent;
}

// Sign-in leftovers serve no one: expired sessions can't sign anyone in, and a reset
// link that was used or has expired can't be used again. Keeping them only keeps data.
export async function purgeExpiredSignIns(now: Date): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const sessions = await tx.session.deleteMany({ where: { expires: { lt: now } } });
    const tokens = await tx.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    });
    return sessions.count + tokens.count;
  });
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
  const result = {
    deadlineReminders: 0,
    moaWarnings: 0,
    dsarReminders: 0,
    reviewDigests: 0,
    emailRetries: 0,
    expiredSignIns: 0,
    // null when the scan step threw.
    retention: null as { ran: boolean; flagged: number } | null,
    errors: [] as string[],
  };

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
      // Former interns: their semester is archived.
      semester: { archivedAt: null },
    },
    select: { id: true, userId: true, renderedHours: true, requiredHours: true },
  });
  // Interns who already finished their hours owe no more weekly reports.
  const stillInterning = notStarted.filter(
    (p) => p.requiredHours == null || Number(p.renderedHours ?? 0) < p.requiredHours
  );
  for (const profile of stillInterning) {
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
        title: `${expiring.length} ${expiring.length === 1 ? "MOA" : "MOAs"} expiring within ${settings.moaWarningDays} days`,
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
    result.reviewDigests = await sendReviewDigests(now);
  } catch (error) {
    console.error("Review digest failed", { error });
    result.errors.push("digest");
  }

  try {
    result.emailRetries = await retryFailedEmails(now);
  } catch (error) {
    console.error("Email retry failed", { error });
    result.errors.push("email-retry");
  }

  try {
    result.dsarReminders = await remindDueDataRequests(now);
  } catch (error) {
    console.error("DSAR due reminder failed", { error });
    result.errors.push("dsar");
  }

  try {
    result.expiredSignIns = await purgeExpiredSignIns(now);
  } catch (error) {
    console.error("Expired sign-in cleanup failed", { error });
    result.errors.push("sign-in-cleanup");
  }

  // NFR-DP-08: quarterly (the scan gates itself); flags only, never deletes.
  try {
    result.retention = await runRetentionScan(now);
  } catch (error) {
    console.error("Retention scan failed", { error });
    result.errors.push("retention");
  }

  return result;
}
