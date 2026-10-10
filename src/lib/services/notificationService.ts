// 12 automated notification triggers via Resend. See PRD Module 11 (FR-NT-*).

// FR-WR-07 — Owner: Rhaastas (org invite pending — GitHub issue #27
// created unassigned; assign once they accept)
// Requirement: Faculty and students must receive email notifications when
// reports are approved or returned.
// Connects to: called by PATCH /api/weekly-reports/[id]/review (Task 12
// route) right after `reviewWeeklyReport_Approve`/`_Return`/`_Regard`/
// `_Disregard` (`weeklyReportService.ts`, Task 4) returns. Should use
// Resend + React Email per FR-NT-04's convention (Module 11) — no existing
// Resend client/template setup exists in this codebase yet (Module 11 is
// out of scope for Phase 3), so the real implementation likely needs that
// infrastructure stood up first; flag that dependency rather than silently
// blocking on it.
// Edge cases: none specific to this stub — the "sent: false" placeholder
// intentionally never fails the calling route (the review action itself
// must still succeed even if email delivery isn't implemented yet).
export async function sendReportStatusEmail(
  weeklyReportId: string,
  action: "APPROVE" | "RETURN" | "REGARD" | "DISREGARD"
): Promise<{ sent: boolean }> {
  // TODO(Rhaastas): implement per the contract above.
  void weeklyReportId;
  void action;
  return { sent: false };
}
