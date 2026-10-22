// 12 automated notification triggers via Resend. See PRD Module 11 (FR-NT-*).
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notify";
import { getAssignedFacultyIds } from "@/lib/services/notificationRecipients";
import { WeeklyReportStatusEmail } from "@/components/emails/weekly-report-status-email";

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
  // Disregard deletes the report before this hook; its recipients no longer exist.
  // Submission email belongs to Module 11's separate submission trigger.
  if (action === "DISREGARD") return { sent: false };
  try {
    const report = await prisma.weeklyReport.findUnique({
      where: { id: weeklyReportId },
      select: {
        weekStart: true,
        weekEnd: true,
        revisionHistory: true,
        studentProfileId: true,
        studentProfile: { select: { deletedAt: true, userId: true } },
      },
    });
    if (!report || report.studentProfile.deletedAt) return { sent: false };
    const userIds = [
      report.studentProfile.userId,
      ...(await getAssignedFacultyIds(report.studentProfileId)),
    ];
    const status = { APPROVE: "approved", RETURN: "returned", REGARD: "regarded" }[action];
    const history = Array.isArray(report.revisionHistory) ? report.revisionHistory : [];
    const lastReturn = [...history]
      .reverse()
      .find(
        (entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry) && entry.type === "RETURNED"
      );
    const notes =
      action === "RETURN" &&
      lastReturn &&
      typeof lastReturn === "object" &&
      !Array.isArray(lastReturn) &&
      typeof lastReturn.notes === "string"
        ? lastReturn.notes
        : undefined;
    const reportPath = `/students/${report.studentProfileId}/weekly-reports/${weeklyReportId}`;
    const baseUrl = process.env.NEXTAUTH_URL;
    const reportUrl =
      baseUrl && /^https?:\/\//.test(baseUrl) ? new URL(reportPath, baseUrl).href : undefined;
    const email = WeeklyReportStatusEmail({
      status,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      notes,
      reportUrl,
    });
    // notify() sends one message per recipient (addresses stay private), records
    // in-app and email rows, and never throws.
    const result = await notify({
      userIds,
      trigger: action === "RETURN" ? "REPORT_RETURNED" : "REPORT_APPROVED",
      title: `IDSMS-CIS: weekly report ${status}`,
      body: notes ?? `Your weekly report was ${status} by your faculty adviser.`,
      link: `/students/${report.studentProfileId}/weekly-reports`,
      email: true,
      emailOverrides: Object.fromEntries(userIds.map((id) => [id, email])),
    });
    return { sent: result.emailed > 0 && result.failed === 0 };
  } catch {
    // The review has already committed successfully; delivery is best effort.
    return { sent: false };
  }
}
