import { DeviationType, ValidationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getHolidayCalendarForStudent } from "@/lib/services/attendance/attendanceService";
import {
  getConductDeductions,
  getConfirmedSubmission,
} from "@/lib/services/reports/weeklyReportService";
import { entryCreditedHours } from "@/lib/utils/creditedHours";
import { displayNameFromEmail } from "@/lib/utils/displayName";
import { getWeeklyReportDueDate, getWeekStartMonday, toDateKey } from "@/lib/utils/reportDeadline";
import type { TimeRow, WeeklyReportDocumentData } from "@/lib/documents/weeklyReportTemplate";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Single read path for everything the weekly report document shows — used
// by both the preview page and server PDF generation so they can't drift.
export async function loadWeeklyReportDocumentData(
  weeklyReportId: string
): Promise<WeeklyReportDocumentData | null> {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    select: {
      id: true,
      studentProfileId: true,
      weekStart: true,
      weekEnd: true,
      totalHours: true,
      runningTotal: true,
      remainingHours: true,
      status: true,
      revisionHistory: true,
      dailyEntries: {
        orderBy: { reportDate: "asc" },
        select: {
          reportDate: true,
          scheduledHours: true,
          actualHours: true,
          creditedHours: true,
          accomplishments: true,
          toolsUsed: true,
          attendanceStatus: true,
          timeIn: true,
          timeOut: true,
          timeIn2: true,
          timeOut2: true,
        },
      },
      studentProfile: {
        select: {
          studentNumber: true,
          program: true,
          positionTitle: true,
          requiredHours: true,
          fullName: true,
          user: { select: { email: true } },
          company: { select: { name: true, supervisorName: true } },
          semester: { select: { weekOneStart: true } },
        },
      },
    },
  });
  if (!report) return null;

  // Null while a draft or returned for revision, so the preview shows the
  // PREVIEW watermark and generation is refused (FR-DG-05).
  const submission = getConfirmedSubmission(report);
  const profile = report.studentProfile;

  // Week 1 is faculty-defined per term; without it, the student's first
  // report week is Week 1.
  const weekOne =
    profile.semester.weekOneStart ??
    (
      await prisma.weeklyReport.findFirst({
        where: { studentProfileId: report.studentProfileId },
        orderBy: { weekStart: "asc" },
        select: { weekStart: true },
      })
    )?.weekStart ??
    report.weekStart;
  // A week before the faculty's Week 1 (early starter) still prints as Week 1.
  const weekNumber = Math.max(
    1,
    Math.floor((report.weekStart.getTime() - getWeekStartMonday(weekOne).getTime()) / WEEK_MS) + 1
  );

  const [requests, holidays] = await Promise.all([
    prisma.deviationReport.findMany({
      where: {
        studentProfileId: report.studentProfileId,
        deviationType: { in: [DeviationType.OVERTIME, DeviationType.UNDERTIME] },
        validationStatus: { not: ValidationStatus.REJECTED },
        date: { gte: report.weekStart, lte: report.weekEnd },
      },
      orderBy: { date: "asc" },
      select: {
        deviationType: true,
        date: true,
        startTime: true,
        endTime: true,
        requestedMinutes: true,
        reason: true,
        validationStatus: true,
      },
    }),
    report.dailyEntries.some((e) => e.attendanceStatus === "HOLIDAY")
      ? getHolidayCalendarForStudent(report.studentProfileId)
      : Promise.resolve([]),
  ]);
  const holidayName = new Map(holidays.map((h) => [toDateKey(h.date), h.name]));
  const toRow = (r: (typeof requests)[number]): TimeRow => ({
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    minutes: r.requestedMinutes ?? 0,
    reason: r.reason,
    pending: r.validationStatus === ValidationStatus.PENDING,
  });

  const totalHours = Number(report.totalHours);
  const runningTotal = Number(report.runningTotal);
  const conductDeductions = await getConductDeductions(report.studentProfileId, report.weekEnd);

  return {
    weeklyReportId: report.id,
    studentProfileId: report.studentProfileId,
    referenceCode: submission?.referenceCode ?? null,
    submittedAt: submission ? new Date(submission.timestamp) : null,
    reasonForDelay: submission?.reasonForDelay ?? null,
    weekStart: report.weekStart,
    weekEnd: report.weekEnd,
    weekNumber,
    dueDate: getWeeklyReportDueDate(report.weekEnd),
    student: {
      name: profile.fullName?.trim() || displayNameFromEmail(profile.user.email),
      email: profile.user.email,
      studentNumber: profile.studentNumber,
      program: profile.program,
      positionTitle: profile.positionTitle,
      requiredHours: profile.requiredHours,
    },
    company: profile.company,
    entries: report.dailyEntries.map((e) => ({
      reportDate: e.reportDate,
      actualHours: e.actualHours == null ? null : Number(e.actualHours),
      creditedHours: e.actualHours == null ? null : entryCreditedHours(e),
      accomplishments: e.accomplishments,
      toolsUsed: e.toolsUsed,
      attendanceStatus: e.attendanceStatus,
      timeIn: e.timeIn,
      timeOut: e.timeOut,
      timeIn2: e.timeIn2,
      timeOut2: e.timeOut2,
      holidayName: holidayName.get(toDateKey(e.reportDate)) ?? null,
    })),
    overtime: requests.filter((r) => r.deviationType === DeviationType.OVERTIME).map(toRow),
    undertime: requests.filter((r) => r.deviationType === DeviationType.UNDERTIME).map(toRow),
    totals: {
      totalHours,
      runningTotal,
      conductDeductions,
      remainingHours: Number(report.remainingHours),
      beginning: Math.round((runningTotal - totalHours) * 100) / 100,
      ending: runningTotal,
    },
  };
}
