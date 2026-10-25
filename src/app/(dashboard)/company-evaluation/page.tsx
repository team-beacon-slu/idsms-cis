import { redirect } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  CRITERIA,
  getEvaluationState,
} from "@/lib/services/predeployment/companyEvaluationService";
import { formatCalendarDate } from "@/lib/documents/html";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { CompanyEvaluationForm } from "./company-evaluation-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Company evaluation" };

// Company view: the intern rates their host company once all required hours are confirmed.
export default async function CompanyEvaluationPage() {
  const user = await requireUserPage();
  if (user.role !== Role.STUDENT_INTERN) redirect("/");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) redirect("/");
  const state = await getEvaluationState(profile.id);
  if (!state) redirect("/");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company evaluation"
        description="Rate your host company once your internship hours are done. Only SLU staff see the results, and never per intern: a company's ratings appear only once 5 interns have rated it."
      />
      {state.submittedAt ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm">
            <CheckCircle2 className="size-5 text-green-700" aria-hidden="true" />
            Thank you. You evaluated {state.companyName} on{" "}
            {formatCalendarDate(new Date(state.submittedAt))}.
          </CardContent>
        </Card>
      ) : !state.open ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Lock className="size-5" aria-hidden="true" />
            {state.companyName
              ? `Opens once all ${state.requiredHours} required hours are confirmed (${state.confirmedHours} so far).`
              : "Opens once you have a host company and all your required hours are confirmed."}
          </CardContent>
        </Card>
      ) : (
        <CompanyEvaluationForm
          studentProfileId={profile.id}
          companyName={state.companyName!}
          criteria={CRITERIA.map(({ key, label }) => ({ key, label }))}
        />
      )}
    </div>
  );
}
