import { prisma } from "@/lib/prisma";
import { getLatestSubmission } from "@/lib/services/weeklyReportService";
import { getWeeklyReportDueDate } from "@/lib/utils/reportDeadline";
import type { WeeklyReportDocumentData } from "@/lib/documents/weeklyReportTemplate";

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
      revisionHistory: true,
      dailyEntries: {
        orderBy: { reportDate: "asc" },
        select: { reportDate: true, actualHours: true, accomplishments: true, toolsUsed: true },
      },
      studentProfile: {
        select: {
          studentNumber: true,
          program: true,
          positionTitle: true,
          requiredHours: true,
          user: { select: { email: true } },
          company: { select: { name: true, supervisorName: true } },
        },
      },
    },
  });
  if (!report) return null;

  const submission = getLatestSubmission(report.revisionHistory);
  const profile = report.studentProfile;

  return {
    weeklyReportId: report.id,
    studentProfileId: report.studentProfileId,
    referenceCode: submission?.referenceCode ?? null,
    submittedAt: submission ? new Date(submission.timestamp) : null,
    reasonForDelay: submission?.reasonForDelay ?? null,
    weekStart: report.weekStart,
    weekEnd: report.weekEnd,
    dueDate: getWeeklyReportDueDate(report.weekEnd),
    student: {
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
      accomplishments: e.accomplishments,
      toolsUsed: e.toolsUsed,
    })),
    totals: {
      totalHours: Number(report.totalHours),
      runningTotal: Number(report.runningTotal),
      remainingHours: Number(report.remainingHours),
    },
  };
}
