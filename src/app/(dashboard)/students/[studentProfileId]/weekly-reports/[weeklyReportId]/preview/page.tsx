import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";
import { renderWeeklyReportHtml } from "@/lib/documents/weeklyReportTemplate";
import { PrintButton } from "./print-button";

// FR-WR-09 preview target (see weeklyReportService.generateReportPdfPreview).
// Renders the same HTML template Module 8's Puppeteer pipeline prints, so the
// preview and the generated PDF can't drift apart.
export default async function WeeklyReportPreviewPage({
  params,
}: {
  params: { studentProfileId: string; weeklyReportId: string };
}) {
  const user = await requireUserPage();
  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/");
    throw error;
  }

  const data = await loadWeeklyReportDocumentData(params.weeklyReportId);
  // The URL's studentProfileId was access-checked above, so the report must
  // belong to that same student — otherwise this is someone else's report.
  if (!data || data.studentProfileId !== params.studentProfileId) {
    notFound();
  }
  const html = renderWeeklyReportHtml(data);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          This is exactly what the generated PDF will contain.
        </p>
        <PrintButton frameId="report-preview" />
      </div>
      {/* No allow-scripts: even an escaping bug can't run script here.
          allow-same-origin lets PrintButton reach contentWindow; allow-modals
          lets the frame open its print dialog. */}
      <iframe
        id="report-preview"
        title="Weekly report preview"
        srcDoc={html}
        sandbox="allow-same-origin allow-modals"
        className="h-[1100px] w-full rounded-lg border bg-white"
      />
    </div>
  );
}
