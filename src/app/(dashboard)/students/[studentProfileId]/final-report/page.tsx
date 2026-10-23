import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { FINAL_REPORT_REVIEWERS, getFinalReportState } from "@/lib/services/finalReportService";
import { getFinalTechnicalReportDocument } from "@/lib/services/documentService";
import { toContent } from "@/lib/validators/finalReport";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { FinalReportEditor } from "./final-report-editor";
import { FinalReportReview } from "./final-report-review";
import type { Metadata } from "next";

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

  const [state, pdf] = await Promise.all([
    getFinalReportState(params.studentProfileId),
    getFinalTechnicalReportDocument(params.studentProfileId),
  ]);
  const report = state.report;
  const content = report
    ? toContent(report)
    : {
        sections: {},
        supervisorScore: null,
        supervisorScale: null,
        peerScore: null,
        peerScale: null,
        attachments: {},
      };
  const isOwner = user.role === Role.STUDENT_INTERN;
  const isReviewer = FINAL_REPORT_REVIEWERS.includes(user.role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Final report"
        description={`The final technical report. Opens at ${state.threshold} confirmed hours (${state.renderedHours} so far); reviewed by the department coordinator.`}
      />

      {!state.unlocked && !report ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Lock className="size-5" aria-hidden="true" />
            Unlocks at {state.threshold} confirmed hours —{" "}
            {Math.round((state.threshold - state.renderedHours) * 100) / 100} more hours to go.
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
                hasPdf={pdf?.status === "GENERATED"}
              />
            ) : (
              <FinalReportEditor
                studentProfileId={params.studentProfileId}
                status="SUBMITTED"
                content={content}
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
