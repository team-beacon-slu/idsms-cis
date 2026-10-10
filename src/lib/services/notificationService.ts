// 12 automated notification triggers via Resend. See PRD Module 11 (FR-NT-*).
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false };
  try {
    const report = await prisma.weeklyReport.findUnique({
      where: { id: weeklyReportId },
      select: {
        weekStart: true,
        weekEnd: true,
        revisionHistory: true,
        studentProfileId: true,
        studentProfile: {
          select: {
            deletedAt: true,
            classGroupId: true,
            semesterId: true,
            user: { select: { email: true, isActive: true, deletedAt: true } },
          },
        },
      },
    });
    if (!report || report.studentProfile.deletedAt) return { sent: false };
    const assignments = await prisma.facultyClassGroup.findMany({
      where: {
        classGroupId: report.studentProfile.classGroupId,
        semesterId: report.studentProfile.semesterId,
      },
      select: { faculty: { select: { email: true, isActive: true, deletedAt: true } } },
    });
    const recipients = Array.from(
      new Set(
        [report.studentProfile.user, ...assignments.map(({ faculty }) => faculty)]
          .filter((user) => user.isActive && !user.deletedAt && user.email)
          .map((user) => user.email)
      )
    );
    if (!recipients.length) return { sent: false };
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
    const resend = new Resend(apiKey);
    // Separate messages keep the recipients' addresses private.
    const results = await Promise.all(
      recipients.map((to) =>
        resend.emails.send({
          from,
          to,
          subject: `IDSMS-CIS: weekly report ${status}`,
          react: email,
        })
      )
    );
    return { sent: results.every(({ data, error }) => !!data?.id && !error) };
  } catch {
    // The review has already committed successfully; delivery is best effort.
    return { sent: false };
  }
}
