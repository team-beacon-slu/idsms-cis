import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { getLatestSubmission } from "@/lib/services/weeklyReportService";
import { getWeeklyReportDueDate } from "@/lib/utils/reportDeadline";
import { PrintButton } from "./print-button";

// FR-WR-09 preview target (see weeklyReportService.generateReportPdfPreview).
// A print-styled rendering of the weekly report; the browser's
// "Save as PDF" produces the file until Module 8's Puppeteer pipeline exists.

function formatDate(date: Date, withWeekday = false) {
  return date.toLocaleDateString("en-PH", {
    ...(withWeekday ? { weekday: "short" as const } : {}),
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

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

  const report = await prisma.weeklyReport.findUnique({
    where: { id: params.weeklyReportId },
    include: {
      dailyEntries: { orderBy: { reportDate: "asc" } },
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
  // The URL's studentProfileId was access-checked above, so the report must
  // belong to that same student — otherwise this is someone else's report.
  if (!report || report.studentProfileId !== params.studentProfileId) {
    notFound();
  }

  const submission = getLatestSubmission(report.revisionHistory);
  const profile = report.studentProfile;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          Preview — this is how the report will look when printed or saved as PDF.
        </p>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-3xl rounded-lg border bg-white p-8 text-black shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-black/20 pb-4 text-center">
          <p className="text-xs uppercase tracking-widest text-black/60">
            Saint Louis University · SAMCIS
          </p>
          <h1 className="mt-1 text-xl font-bold">Weekly Internship Report</h1>
          <p className="text-sm">
            {formatDate(report.weekStart)} – {formatDate(report.weekEnd)}
          </p>
        </header>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-black/60">Student</dt>
          <dd>{profile.user.email}</dd>
          <dt className="text-black/60">Student number</dt>
          <dd>{profile.studentNumber}</dd>
          <dt className="text-black/60">Program</dt>
          <dd>{profile.program}</dd>
          <dt className="text-black/60">Host company</dt>
          <dd>{profile.company?.name ?? "—"}</dd>
          <dt className="text-black/60">Supervisor</dt>
          <dd>{profile.company?.supervisorName ?? "—"}</dd>
          <dt className="text-black/60">Position</dt>
          <dd>{profile.positionTitle ?? "—"}</dd>
          <dt className="text-black/60">Due date</dt>
          <dd>{formatDate(getWeeklyReportDueDate(report.weekEnd))}</dd>
          <dt className="text-black/60">Reference code</dt>
          <dd className="font-mono">{submission?.referenceCode ?? "Issued on submission"}</dd>
        </dl>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/30 text-left">
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Hours</th>
              <th className="py-2 pr-2">Accomplishments</th>
              <th className="py-2">Tools used</th>
            </tr>
          </thead>
          <tbody>
            {report.dailyEntries.map((entry) => (
              <tr key={entry.id} className="break-inside-avoid border-b border-black/10 align-top">
                <td className="whitespace-nowrap py-2 pr-2">
                  {formatDate(entry.reportDate, true)}
                </td>
                <td className="py-2 pr-2">
                  {entry.actualHours == null ? "—" : Number(entry.actualHours)}
                </td>
                <td className="whitespace-pre-wrap py-2 pr-2">{entry.accomplishments ?? "—"}</td>
                <td className="py-2">{entry.toolsUsed ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded border border-black/20 p-2">
            <dt className="text-black/60">Total this week</dt>
            <dd className="font-semibold">{Number(report.totalHours)} hrs</dd>
          </div>
          <div className="rounded border border-black/20 p-2">
            <dt className="text-black/60">Running total</dt>
            <dd className="font-semibold">{Number(report.runningTotal)} hrs</dd>
          </div>
          <div className="rounded border border-black/20 p-2">
            <dt className="text-black/60">Remaining</dt>
            <dd className="font-semibold">
              {Number(report.remainingHours)} / {profile.requiredHours} hrs
            </dd>
          </div>
        </dl>

        {submission?.reasonForDelay && (
          <p className="mt-4 text-sm">
            <span className="font-semibold">Reason for late submission:</span>{" "}
            {submission.reasonForDelay}
          </p>
        )}

        <footer className="mt-10 grid grid-cols-2 gap-10 text-center text-xs">
          <div className="border-t border-black/40 pt-1">Student signature</div>
          <div className="border-t border-black/40 pt-1">Company supervisor signature</div>
        </footer>
        {submission && (
          <p className="mt-6 text-center text-[10px] text-black/50">
            {submission.referenceCode} · submitted {new Date(submission.timestamp).toISOString()}
          </p>
        )}
      </article>
    </div>
  );
}
