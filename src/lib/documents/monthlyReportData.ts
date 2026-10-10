import { WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MonthlyReportDocumentData } from "@/lib/documents/monthlyReportTemplate";

// Same overlap rule as monthlyReportService.checkMonthlyAggregationEligibility:
// a week counts toward every calendar month it touches.
export async function loadMonthlyReportDocumentData(
  generatedDocumentId: string,
  referenceCode: string
): Promise<MonthlyReportDocumentData | null> {
  const doc = await prisma.generatedDocument.findUnique({
    where: { id: generatedDocumentId },
    select: {
      id: true,
      periodLabel: true,
      studentProfileId: true,
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
  if (!doc?.periodLabel) return null;

  const [year, month] = doc.periodLabel.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1) - 1);

  const weeks = await prisma.weeklyReport.findMany({
    where: {
      studentProfileId: doc.studentProfileId,
      weekStart: { lte: monthEnd },
      weekEnd: { gte: monthStart },
    },
    orderBy: { weekStart: "asc" },
    select: { weekStart: true, weekEnd: true, status: true, totalHours: true },
  });

  const approved = new Set<string>([WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED]);
  const profile = doc.studentProfile;

  return {
    generatedDocumentId: doc.id,
    studentProfileId: doc.studentProfileId,
    calendarMonth: doc.periodLabel,
    referenceCode,
    generatedAt: new Date(),
    student: {
      email: profile.user.email,
      studentNumber: profile.studentNumber,
      program: profile.program,
      positionTitle: profile.positionTitle,
      requiredHours: profile.requiredHours,
    },
    company: profile.company,
    weeks: weeks.map((w) => ({ ...w, totalHours: Number(w.totalHours) })),
    approvedHours:
      Math.round(
        weeks
          .filter((w) => approved.has(w.status))
          .reduce((sum, w) => sum + Number(w.totalHours), 0) * 100
      ) / 100,
  };
}
