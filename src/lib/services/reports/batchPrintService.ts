// Batch print (panel revisions, final defense): the approved Weekly Work Reports of one or
// more interns as ONE PDF, each report starting on a new page, for printing in one go.
// Rendered on request from the same template as each week's PDF; nothing is stored.
import { Role, WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { DocumentNotReadyError } from "@/lib/documents/errors";
import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";
import { renderWeeklyReportHtml } from "@/lib/documents/weeklyReportTemplate";
import { combineDocuments } from "@/lib/documents/slu";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";

// shortcut: one Chrome render; ~60 weekly reports fit the 120 s route limit. Split by class
// group (or render in chunks) if larger batches are needed.
export const BATCH_PRINT_MAX_REPORTS = 60;

// Official copies only: weeks the adviser Approved or Regarded.
const PRINTABLE = [WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED];

export async function listPrintableWeeklyReports(studentProfileIds: string[]) {
  const reports = await prisma.weeklyReport.findMany({
    where: { studentProfileId: { in: studentProfileIds }, status: { in: PRINTABLE } },
    select: {
      id: true,
      weekStart: true,
      studentProfileId: true,
      studentProfile: { select: { fullName: true } },
    },
    orderBy: { weekStart: "asc" },
  });
  // Intern by intern (by name; same names kept apart by id), each intern's weeks in order.
  return reports.sort(
    (a, b) =>
      (a.studentProfile.fullName ?? "").localeCompare(b.studentProfile.fullName ?? "") ||
      a.studentProfileId.localeCompare(b.studentProfileId) ||
      a.weekStart.getTime() - b.weekStart.getTime()
  );
}

export async function renderWeeklyReportsBatch(
  studentProfileIds: string[],
  actingUser: { id: string; role: Role }
): Promise<Buffer> {
  for (const id of studentProfileIds) await assertCanAccessStudent(actingUser, id);
  const reports = await listPrintableWeeklyReports(studentProfileIds);
  if (reports.length === 0) {
    throw new DocumentNotReadyError("There are no approved weekly reports to print yet");
  }
  if (reports.length > BATCH_PRINT_MAX_REPORTS) {
    throw new DocumentNotReadyError(
      `That is ${reports.length} weekly reports; print at most ${BATCH_PRINT_MAX_REPORTS} at a time (pick fewer interns)`
    );
  }
  const documents: string[] = [];
  // One at a time: the database pool can be a single connection (PG_POOL_MAX=1 on the beta).
  for (const report of reports) {
    const data = await loadWeeklyReportDocumentData(report.id);
    if (data?.referenceCode) documents.push(renderWeeklyReportHtml(data));
  }
  if (documents.length === 0) {
    throw new DocumentNotReadyError("There are no approved weekly reports to print yet");
  }
  return renderHtmlToPdf(combineDocuments("Weekly Work Reports", documents), 60_000);
}
