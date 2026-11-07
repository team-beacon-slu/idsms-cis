import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { Role, WeeklyReportStatus } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import {
  FINAL_REPORT_REVIEWERS,
  getFinalReportState,
} from "@/lib/services/reports/finalReportService";
import { getFinalTechnicalReportDocument } from "@/lib/services/reports/documentService";
import { emptyAssessment, toContent } from "@/lib/validators/finalReport";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { FinalReportEditor } from "./final-report-editor";
import { FinalReportReview } from "./final-report-review";
import type { Metadata } from "next";
import { formatHrsMins } from "@/lib/utils/timeMath";

export const metadata: Metadata = { title: "Final report" };

// Workstream H (PRD Module 7) — the Final Technical Report page.
const STATUS_TEXT: Record<string, string> = {
  DRAFT: "Draft — not submitted yet",
  SUBMITTED: "Submitted — waiting for the coordinator's review",
  APPROVED: "Approved",
  RETURNED: "Returned for revision",
};

export default async function FinalReportPage(props: {
  params: Promise<{ studentProfileId: string }>;
}) {
  const params = await props.params;
  const user = await requireUserPage();
  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/");
    throw error;
  }

  const isOwner = user.role === Role.STUDENT_INTERN;
  const [state, pdf, profile, approvedEntries] = await Promise.all([
    getFinalReportState(params.studentProfileId),
    getFinalTechnicalReportDocument(params.studentProfileId),
    prisma.studentProfile.findUnique({
      where: { id: params.studentProfileId },
      select: {
        office: true,
        company: { select: { supervisorName: true, supervisorPosition: true } },
      },
    }),
    // Efficiency item 26: the intern's own approved days, to insert into Tasks/Accomplishments.
    isOwner
      ? prisma.dailyReportEntry.findMany({
          where: {
            accomplishments: { not: null },
            weeklyReport: {
              studentProfileId: params.studentProfileId,
              status: { in: [WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED] },
            },
          },
          orderBy: { reportDate: "asc" },
          select: { accomplishments: true },
        })
      : Promise.resolve([]),
  ]);
  const approvedWork = [
    ...new Set(approvedEntries.map((e) => e.accomplishments?.trim()).filter(Boolean)),
  ]
    .map((text) => `- ${text}`)
    .join("\n");
  const report = state.report;
  const content = report
    ? toContent(report)
    : {
        sections: {},
        assessment: emptyAssessment(),
        supervisorScore: null,
        supervisorScale: null,
        peerScore: null,
        peerScale: null,
        attachments: {},
      };
  // A new report starts with the supervisor on record ("name - designation").
  const supervisor = profile?.company;
  if (!content.sections.supervisors && supervisor) {
    content.sections = {
      ...content.sections,
      supervisors: [supervisor.supervisorName, supervisor.supervisorPosition]
        .filter(Boolean)
        .join(" - "),
    };
  }
  const isReviewer = FINAL_REPORT_REVIEWERS.includes(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Final report"
        description={`SLU's Technical Report. Opens at ${state.threshold} confirmed hours (${state.renderedHours} so far); reviewed by the internship coordinator.`}
      />

      {!state.unlocked && !report ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Lock className="size-5" aria-hidden="true" />
            Unlocks at {state.threshold} confirmed hours —{" "}
            {formatHrsMins(state.threshold - state.renderedHours)} more to go.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{report ? STATUS_TEXT[report.status] : "Not started"}</CardTitle>
            {report?.status === "RETURNED" && report.reviewNote && (
              <CardDescription className="text-red-700">
                Coordinator&apos;s note: {report.reviewNote}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {isOwner ? (
              <FinalReportEditor
                studentProfileId={params.studentProfileId}
                status={report?.status ?? null}
                content={content}
                office={profile?.office ?? ""}
                hasPdf={pdf?.status === "GENERATED"}
                approvedWork={approvedWork}
              />
            ) : (
              <FinalReportEditor
                studentProfileId={params.studentProfileId}
                status="SUBMITTED"
                content={content}
                office={profile?.office ?? ""}
                hasPdf={false}
              />
            )}
            {isReviewer && report?.status === "SUBMITTED" && (
              <FinalReportReview
                reportId={report.id}
                attached={content.attachments as Record<string, boolean>}
              />
            )}
            {!isOwner && pdf?.status === "GENERATED" && (
              <a
                href={`/api/students/${params.studentProfileId}/final-report/pdf`}
                className="text-sm text-primary underline"
              >
                Download the approved PDF
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
