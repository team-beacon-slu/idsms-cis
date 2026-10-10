import { redirect } from "next/navigation";
import { CalendarClock, ListChecks } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getWorkPlanHistory } from "@/lib/services/workPlanService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { Role } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { WorkPlanSubmitForm } from "./work-plan-submit-form";
import { WorkPlanReviewActions } from "./work-plan-review-actions";

const REVIEW_ROLES: Role[] = [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

function isTaskList(value: unknown): value is { description: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (task) =>
        typeof task === "object" &&
        task !== null &&
        typeof (task as { description?: unknown }).description === "string"
    )
  );
}

export default async function WorkPlanPage({ params }: { params: { studentProfileId: string } }) {
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const history = await getWorkPlanHistory(params.studentProfileId);
  const latest = history[0];
  const isOwner = user.role === Role.STUDENT_INTERN;
  const canReview = REVIEW_ROLES.includes(user.role);
  const canSubmitNew = isOwner && (!latest || latest.status !== "SUBMITTED");

  const reviewComments =
    latest && latest.approvalMetadata && typeof latest.approvalMetadata === "object"
      ? (latest.approvalMetadata as { comments?: string | null }).comments
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="hidden shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary sm:block">
          <ListChecks className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Work Plan</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Submit planned deployment tasks for coordinator review. A returned plan can be revised
            and resubmitted.
          </p>
        </div>
      </div>

      {canSubmitNew && <WorkPlanSubmitForm studentProfileId={params.studentProfileId} />}

      {latest && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Latest work plan</CardTitle>
                <CardDescription className="mt-1 flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  {new Date(latest.createdAt).toLocaleString()}
                </CardDescription>
              </div>
              <StatusBadge status={latest.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {latest.status === "RETURNED" && reviewComments && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                <p className="font-medium">Reviewer feedback</p>
                <p className="mt-0.5">{reviewComments}</p>
              </div>
            )}

            {isTaskList(latest.plannedTasks) ? (
              <ul className="space-y-2">
                {latest.plannedTasks.map((task, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
                  >
                    <span className="mt-0.5 shrink-0 text-muted-foreground">{index + 1}.</span>
                    <span>{task.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(latest.plannedTasks, null, 2)}
              </pre>
            )}

            {canReview && latest.status === "SUBMITTED" && (
              <WorkPlanReviewActions workPlanId={latest.id} />
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
                    {new Date(plan.createdAt).toLocaleString()}
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
