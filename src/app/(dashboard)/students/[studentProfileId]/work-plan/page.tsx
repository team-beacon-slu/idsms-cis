import { formatInstant } from "@/lib/documents/html";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getWorkPlanHistory } from "@/lib/services/predeployment/workPlanService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import { Role } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { WorkPlanSubmitForm } from "./work-plan-submit-form";
import { connectionFor } from "@/lib/ai/jobs";
import { asWorkPlanRows } from "@/lib/validators/workPlan";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileDown } from "lucide-react";
import { WorkPlanReviewActions } from "./work-plan-review-actions";
import { ProgramFitNote } from "./program-fit-note";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Work plan" };

const REVIEW_ROLES: Role[] = [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

export default async function WorkPlanPage(props: {
  params: Promise<{ studentProfileId: string }>;
}) {
  const params = await props.params;
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const [history, profile] = await Promise.all([
    getWorkPlanHistory(params.studentProfileId),
    prisma.studentProfile.findUniqueOrThrow({
      where: { id: params.studentProfileId },
      select: { program: true },
    }),
  ]);
  const latest = history[0];
  const rows = latest ? asWorkPlanRows(latest.plannedTasks) : [];
  const isOwner = user.role === Role.STUDENT_INTERN;
  const canReview = REVIEW_ROLES.includes(user.role);
  const canSubmitNew = isOwner && (!latest || latest.status !== "SUBMITTED");

  const reviewComments =
    latest && latest.approvalMetadata && typeof latest.approvalMetadata === "object"
      ? (latest.approvalMetadata as { comments?: string | null }).comments
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work plan"
        description="Planned deployment tasks, reviewed by the coordinator. A returned plan can be revised and resubmitted."
      />

      {canSubmitNew && (
        <WorkPlanSubmitForm
          studentProfileId={params.studentProfileId}
          program={profile.program}
          aiRead={canSubmitNew && (await connectionFor("workplan", user)) !== null}
          initialRows={latest?.status === "RETURNED" ? rows : undefined}
        />
      )}

      {latest && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Latest work plan</CardTitle>
                <CardDescription className="mt-1 flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  {formatInstant(new Date(latest.createdAt))}
                </CardDescription>
              </div>
              <StatusBadge status={latest.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {latest.status === "RETURNED" && reviewComments && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-medium">Reviewer feedback</p>
                <p className="mt-0.5">{reviewComments}</p>
              </div>
            )}

            {rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="p-2 font-medium">Period</th>
                      <th className="p-2 font-medium">Area/Topic</th>
                      <th className="p-2 font-medium">Specific tasks</th>
                      <th className="p-2 font-medium">Expected output</th>
                      <th className="p-2 text-right font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className="border-b align-top last:border-0">
                        <td className="p-2">{row.period ?? "—"}</td>
                        <td className="p-2">{row.area ?? "—"}</td>
                        <td className="p-2 whitespace-pre-line">{row.description}</td>
                        <td className="p-2">{row.output ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{row.hours ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(latest.plannedTasks, null, 2)}
              </pre>
            )}

            {latest.filePath && (
              <a
                href={`/api/work-plans/${latest.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mr-2 gap-1.5")}
              >
                <FileDown className="size-3.5" aria-hidden="true" />
                Uploaded work plan
              </a>
            )}
            <a
              href={`/api/students/${params.studentProfileId}/work-plans/pdf`}
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <FileDown className="size-3.5" aria-hidden="true" />
              Download work plan PDF
            </a>

            {canReview && latest.status === "SUBMITTED" && (
              <>
                <ProgramFitNote program={profile.program} tasks={rows} forReviewer />
                <WorkPlanReviewActions workPlanId={latest.id} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Earlier submissions for this student.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {history.slice(1).map((plan) => (
                <li
                  key={plan.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="text-muted-foreground">
                    {formatInstant(new Date(plan.createdAt))}
                  </span>
                  <StatusBadge status={plan.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
