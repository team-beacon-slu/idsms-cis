// Monthly report aggregation over weekly reports. See PRD Module 6 (FR-WR-08).
import { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
export async function checkMonthlyAggregationEligibility(
  studentProfileId: string,
  calendarMonth: string // "YYYY-MM"
): Promise<boolean> {
  // TODO(JayPing23): implement per the contract above.
  void studentProfileId;
  void calendarMonth;
  return false;
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
