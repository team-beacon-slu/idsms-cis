import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getWorkPlanHistory } from "@/lib/services/workPlanService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { Role } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkPlanSubmitForm } from "./work-plan-submit-form";
import { WorkPlanReviewActions } from "./work-plan-review-actions";

const REVIEW_ROLES: Role[] = [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

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

  return (
    <div className="space-y-6">
      {canSubmitNew && <WorkPlanSubmitForm studentProfileId={params.studentProfileId} />}

      {latest && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Latest work plan
              <Badge variant={latest.status === "APPROVED" ? "outline" : "secondary"}>
                {latest.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(latest.plannedTasks, null, 2)}
            </pre>
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
          </CardHeader>
          <CardContent className="space-y-2">
            {history.slice(1).map((plan) => (
              <div key={plan.id} className="flex items-center justify-between text-sm">
                <span>{new Date(plan.createdAt).toLocaleString()}</span>
                <Badge variant="secondary">{plan.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
