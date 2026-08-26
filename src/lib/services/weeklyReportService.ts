// Weekly report submission and the four-way faculty review action. See PRD
// Module 6 (FR-WR-01–07, FR-WR-09–10). Monthly aggregation lives in
// monthlyReportService.ts (FR-WR-08).
import { WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// FR-WR-01 — Owner: Shantea23
// Requirement: auto-generate weekly report forms based on each student's
// approved fixed schedule and semester calendar.
// Connects to: called by POST /api/students/[studentProfileId]/weekly-reports
// (Task 12 route, manual "generate this week" fallback). Creates one
// `WeeklyReport` row (unique on `[studentProfileId, weekStart]`) plus one
// `DailyReportEntry` per scheduled working day (`scheduledHours` pre-filled
// from `WorkPlan.scheduleConfig` in `attendanceService.ts`, `actualHours`
// left null), skipping days `attendanceService.getHolidayCalendarForStudent`
// (Task 3) marks non-working.
// Edge cases: violating the `[studentProfileId, weekStart]` unique
// constraint means a report for that week already exists — decide whether
// to return the existing row or throw.
export async function generateWeeklyReportForm(
  studentProfileId: string,
  weekStart: Date
): Promise<{ weeklyReportId: string; weekStart: Date; weekEnd: Date }> {
  // TODO(Shantea23): implement per the contract above.
  void studentProfileId;
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { weeklyReportId: "", weekStart, weekEnd };
}

// FR-WR-02 — Owner: KennethRusselAvaricio
// Requirement: total hours for the week must be auto-calculated.
// Connects to: called by PATCH /api/weekly-reports/[id] (Task 12 route)
// after every `saveDailyAccomplishment` call below, so the client form can
// show a live total. Sums `DailyReportEntry.actualHours` for this report,
// writes `WeeklyReport.totalHours` (Decimal).
// Edge cases: null `actualHours` (not yet filled in) should count as 0, not throw.
export async function calculateWeeklyTotalHours(weeklyReportId: string): Promise<number> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void weeklyReportId;
  return 0;
}

// FR-WR-02 — Owner: KennethRusselAvaricio
// Requirement: running total hours and hours remaining must be auto-calculated.
// Connects to: called from the same PATCH /api/weekly-reports/[id] route as
// `calculateWeeklyTotalHours` above. Writes `WeeklyReport.runningTotal`
// (cumulative across prior APPROVED/REGARDED weeks + this one, Decimal) and
// `WeeklyReport.remainingHours` (against `StudentProfile.requiredHours`).
// Edge cases: only prior weeks with status APPROVED or REGARDED count
// toward the running total — same status filter as
// `attendanceService.computeTotalHoursRendered`.
export async function calculateRunningTotalAndRemaining(
  studentProfileId: string,
  weeklyReportId: string
): Promise<{ runningTotal: number; remainingHours: number }> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void studentProfileId;
  void weeklyReportId;
  return { runningTotal: 0, remainingHours: 0 };
}

// FR-WR-03 — Owner: gu457 (Ulrich)
// Requirement: only the student may enter actual hours worked and daily
// accomplishments.
// Connects to: called by PATCH /api/weekly-reports/[id] (Task 12 route),
// which then calls `calculateWeeklyTotalHours` and
// `calculateRunningTotalAndRemaining` above and returns all three in one
// response. Writes a single `DailyReportEntry` row (`actualHours`,
// `accomplishments`).
// Edge cases: enforce the caller (`studentUserId`) is the owning student —
// self-only, same pattern as `assertCanAccessStudent` elsewhere — and that
// the parent `WeeklyReport.status` is not already
// APPROVED/REGARDED/DISREGARDED (those are locked).
export async function saveDailyAccomplishment(
  dailyReportEntryId: string,
  hours: number,
  accomplishments: string,
  studentUserId: string
): Promise<{ id: string; hours: number; accomplishments: string }> {
  // TODO(gu457): implement per the contract above.
  void studentUserId;
  return { id: dailyReportEntryId, hours, accomplishments };
}

// FR-WR-05 — Owner: Shantea23
// Requirement: reports are due Tuesday; late submissions require the
// student to fill out a mandatory "Reason for Delay" field before the
// system accepts the submission. Faculty can view this note during review.
// Connects to: called by POST /api/weekly-reports/[id]/submit (Task 12
// route) before `generateReportReferenceCode` below. No dedicated schema
// field currently exists for the delay reason — store it in
// `WeeklyReport.revisionHistory` (Json, already used by
// `reviewWeeklyReport_Return` below) or add a field; note whichever choice
// is made here in this comment for `reviewWeeklyReport_*`'s implementers to
// find it.
// Edge cases: no-op (don't throw) if the report is not actually late.
export async function validateLateSubmissionReason(
  weeklyReportId: string,
  reasonForDelay?: string
): Promise<void> {
  // TODO(Shantea23): implement per the contract above.
  void weeklyReportId;
  void reasonForDelay;
  return;
}

// FR-WR-06 (Approve) — Owner: JayPing23 (Danielle)
// Requirement: Faculty can Approve — hours count, status complete.
// Connects to: called by PATCH /api/weekly-reports/[id]/review (Task 12
// route, `action: "APPROVE"`, Faculty-only). Sets `WeeklyReport.status =
// APPROVED` and `facultyAction`. Must call
// `attendanceService.computeTotalHoursRendered` +
// `computeProjectedCompletionDate` (Task 3) afterward, since this report's
// hours now count toward both. The route also calls
// `notificationService.sendReportStatusEmail` (Task 8) after this returns.
// Edge cases: none beyond the status transition itself.
export async function reviewWeeklyReport_Approve(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(JayPing23): implement per the contract above.
  void facultyId;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-06 (Return) — Owner: KennethRusselAvaricio
// Requirement: Faculty can Return — requires student revision, hours do
// not count yet.
// Connects to: called by the same PATCH /api/weekly-reports/[id]/review
// route (`action: "RETURN"`). Sets `WeeklyReport.status = RETURNED`,
// appends `notes` to `WeeklyReport.revisionHistory` (Json array).
// Edge cases: hours must NOT be recomputed — a RETURNED report is excluded
// from `computeTotalHoursRendered`'s status filter by construction.
export async function reviewWeeklyReport_Return(
  weeklyReportId: string,
  facultyId: string,
  notes: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void facultyId;
  void notes;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-06 (Regard) — Owner: KennethRusselAvaricio
// Requirement: Faculty can Regard — acknowledged, hours count, but marked
// for minor improvement/no revision needed.
// Connects to: same review route (`action: "REGARD"`). Sets
// `WeeklyReport.status = REGARDED` — hours count exactly like Approve
// (trigger `computeTotalHoursRendered`/`computeProjectedCompletionDate`,
// Task 3), the status is just visually distinct in the UI.
// Edge cases: none — this is the "same effect as Approve, different label" branch.
export async function reviewWeeklyReport_Regard(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void facultyId;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-06 (Disregard) — Owner: JayPing23 (Danielle)
// Requirement: Faculty can Disregard — invalid submission (e.g. wrong
// week), hours do not count, requires full resubmission.
// Connects to: same review route (`action: "DISREGARD"`). Sets
// `WeeklyReport.status = DISREGARDED`; excluded from
// `computeTotalHoursRendered`. Must clear/reset the row so
// `generateWeeklyReportForm` above can regenerate a fresh form for that
// week without violating the `[studentProfileId, weekStart]` unique constraint.
// Edge cases: deciding "clear vs. delete-and-recreate" for the DISREGARDED
// row is this function's actual design work — document the choice here for
// `generateWeeklyReportForm`'s implementer.
export async function reviewWeeklyReport_Disregard(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(JayPing23): implement per the contract above.
  void facultyId;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-09 — Owner: gu457 (Ulrich)
// Requirement: students must be able to preview a PDF of their report
// before final submission.
// Connects to: called by GET /api/weekly-reports/[id]/preview (Task 12
// route). This is a lightweight preview, NOT the final Puppeteer-rendered
// PDF from Module 8's `documentService.ts` (out of scope for Phase 3 — see
// the design spec's "Out of scope" section).
// Edge cases: none — read-only rendering.
export async function generateReportPdfPreview(
  weeklyReportId: string
): Promise<{ previewUrl: string | null }> {
  // TODO(gu457): implement per the contract above.
  void weeklyReportId;
  return { previewUrl: null };
}

// FR-WR-10 — Owner: Shantea23
// Requirement: a submitted report PDF must be auto-generated with a system
// reference code and timestamp.
// Connects to: called by POST /api/weekly-reports/[id]/submit (Task 12
// route), after `validateLateSubmissionReason` above passes. The actual PDF
// file generation is Module 8's job (out of scope here) — this function
// only produces the reference code + timestamp pair that gets attached to it.
// Edge cases: reference code must be globally unique (matches the pattern
// `GeneratedDocument.referenceCode`'s `@unique` constraint expects, even
// though this function doesn't write to that table directly).
export async function generateReportReferenceCode(
  weeklyReportId: string
): Promise<{ referenceCode: string; timestamp: Date }> {
  // TODO(Shantea23): implement per the contract above.
  void weeklyReportId;
  return { referenceCode: "", timestamp: new Date() };
}

// Trivial reads — not stubs, match Phase 2's listCompanies precedent.
export async function listWeeklyReportsForStudent(studentProfileId: string) {
  return prisma.weeklyReport.findMany({
    where: { studentProfileId },
    orderBy: { weekStart: "desc" },
  });
}

export async function getWeeklyReport(weeklyReportId: string) {
  return prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    include: { dailyEntries: true },
  });
}
