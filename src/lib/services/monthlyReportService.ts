// Monthly report aggregation over weekly reports. See PRD Module 6 (FR-WR-08).
import { DocumentType, WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// `calendarMonth` is always "YYYY-MM" (see both functions' JSDoc below).
// Shared here since both the eligibility check and (eventually) any
// calendar-month-scoped read would need the same UTC month boundary.
function getCalendarMonthRange(calendarMonth: string): { monthStart: Date; monthEnd: Date } {
  const [year, month] = calendarMonth.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  // One millisecond before the first instant of the following month.
  const monthEnd = new Date(Date.UTC(year, month, 1) - 1);
  return { monthStart, monthEnd };
}

// FR-WR-08 — Owner: JayPing23 (Danielle)
// Requirement: monthly reports aggregate weekly reports by calendar month.
// A monthly report can only be submitted when ALL weekly reports falling
// within that calendar month are Approved or Regarded.
// Connects to: called by POST /api/students/[studentProfileId]/monthly-reports
// (Task 13 route) as the pre-flight gate, before `submitMonthlyReport`
// below. Reads `WeeklyReport` rows (from `weeklyReportService.ts`, Task 4)
// whose `[weekStart, weekEnd]` overlaps `calendarMonth`, checking `status`
// against the same APPROVED/REGARDED filter
// `attendanceService.computeTotalHoursRendered` (Task 3) uses.
// Edge cases: a month with zero weekly reports at all — decide whether
// that's eligible (nothing to block) or ineligible (nothing to aggregate);
// document the choice here.
// Edge case decision: a month with zero overlapping weekly reports is
// INELIGIBLE (returns false), not eligible-by-default — there's nothing to
// aggregate into a MONTHLY_REPORT, so treating "nothing to block" as
// eligible would let `submitMonthlyReport` create an empty report.
export async function checkMonthlyAggregationEligibility(
  studentProfileId: string,
  calendarMonth: string // "YYYY-MM"
): Promise<boolean> {
  const { monthStart, monthEnd } = getCalendarMonthRange(calendarMonth);

  // Overlap test: a WeeklyReport's [weekStart, weekEnd] range overlaps
  // [monthStart, monthEnd] whenever it starts on/before the month ends AND
  // ends on/after the month starts (e.g. a week straddling a month
  // boundary counts toward both months, same as `computeTotalHoursRendered`
  // would see it via its own APPROVED/REGARDED status filter).
  const overlappingReports = await prisma.weeklyReport.findMany({
    where: {
      studentProfileId,
      weekStart: { lte: monthEnd },
      weekEnd: { gte: monthStart },
    },
    select: { status: true },
  });

  if (overlappingReports.length === 0) {
    return false;
  }

  return overlappingReports.every(
    (report) =>
      report.status === WeeklyReportStatus.APPROVED || report.status === WeeklyReportStatus.REGARDED
  );
}

// FR-WR-08 — Owner: JayPing23 (Danielle)
// Requirement: same as above, the actual submission.
// Connects to: called by the same monthly-reports route, only after
// `checkMonthlyAggregationEligibility` above returns true (the route
// enforces this — see Task 13). Creates a `GeneratedDocument` row
// (`documentType: MONTHLY_REPORT`, `status: PENDING_DRAFT`, `periodLabel:
// calendarMonth` — the field Task 1's schema diff added specifically for
// this) inside a `$transaction` with `logEvent`. Read back later by
// `listMonthlyReportsForStudent` below.
// Edge cases: must be idempotent — no duplicate `GeneratedDocument` row for
// the same `studentProfileId` + `periodLabel` (check with `findFirst`
// before creating, same pattern Phase 2's `workPlanService.reviewWorkPlan`
// uses for the endorsement-letter row).
export async function submitMonthlyReport(
  studentProfileId: string,
  calendarMonth: string,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ generatedDocumentId: string; calendarMonth: string }> {
  // TODO(JayPing23): implement per the contract above.
  void studentProfileId;
  void actingUserId;
  void ipAddress;
  return { generatedDocumentId: "", calendarMonth };
}

// Trivial read — not a stub, matches Phase 2's listCompanies precedent.
export async function listMonthlyReportsForStudent(studentProfileId: string) {
  return prisma.generatedDocument.findMany({
    where: { studentProfileId, documentType: DocumentType.MONTHLY_REPORT },
    orderBy: { periodLabel: "desc" },
  });
}
