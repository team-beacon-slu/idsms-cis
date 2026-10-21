// FR-NT-03: the student's "needs attention" counts for the dashboard.
import { ChecklistStatus, ValidationStatus, WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAwaitingReview } from "@/lib/services/weeklyReportService";
import { getWeeklyReportDueInstant } from "@/lib/utils/reportDeadline";

const CHECKLIST_ITEM_COUNT = 9; // FR-CK-04
const DUE_SOON_MS = 48 * 60 * 60 * 1000;

export interface AttentionItems {
  returnedReports: number;
  reportsDueSoon: number; // not yet submitted, deadline within 48h
  pendingDeviations: number;
  incompleteChecklistItems: number;
}

export async function getAttentionItems(
  studentProfileId: string,
  now: Date = new Date()
): Promise<AttentionItems> {
  const [openReports, pendingDeviations, approvedChecklist] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: {
        studentProfileId,
        status: { in: [WeeklyReportStatus.PENDING, WeeklyReportStatus.RETURNED] },
      },
      select: { status: true, weekEnd: true, revisionHistory: true },
    }),
    prisma.deviationReport.count({
      where: { studentProfileId, validationStatus: ValidationStatus.PENDING },
    }),
    prisma.preDeploymentChecklistItem.count({
      where: { studentProfileId, status: ChecklistStatus.APPROVED },
    }),
  ]);

  const returnedReports = openReports.filter(
    (r) => r.status === WeeklyReportStatus.RETURNED
  ).length;
  const reportsDueSoon = openReports.filter((r) => {
    // Drafts only: returned reports are counted above, submitted ones are done.
    if (r.status !== WeeklyReportStatus.PENDING || isAwaitingReview(r)) return false;
    const msLeft = getWeeklyReportDueInstant(r.weekEnd).getTime() - now.getTime();
    return msLeft > 0 && msLeft <= DUE_SOON_MS;
  }).length;

  return {
    returnedReports,
    reportsDueSoon,
    pendingDeviations,
    incompleteChecklistItems: Math.max(0, CHECKLIST_ITEM_COUNT - approvedChecklist),
  };
}

// Workstream L1: leave / OT / UT requests awaiting a faculty adviser's review,
// across the (class group, semester) pairs they advise, per intern so the review
// queue can link straight to each intern's requests.
export async function requestsAwaitingReviewByStudent(
  assigned: { classGroupId: string; semesterId: string }[]
): Promise<Map<string, number>> {
  if (assigned.length === 0) return new Map();
  const groups = await prisma.deviationReport.groupBy({
    by: ["studentProfileId"],
    where: {
      validationStatus: ValidationStatus.PENDING,
      studentProfile: {
        OR: assigned.map(({ classGroupId, semesterId }) => ({ classGroupId, semesterId })),
      },
    },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.studentProfileId, g._count._all]));
}
