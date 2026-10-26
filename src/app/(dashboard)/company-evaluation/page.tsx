import { redirect } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getEvaluationState } from "@/lib/services/predeployment/companyEvaluationService";
import { formatCalendarDate } from "@/lib/documents/html";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
        description="SLU's Host Training Establishment (HTE) Evaluation Form (FM-VAA-052), once your internship hours are done. Staff see results only pooled across 5 or more interns; you download your own copy for Google Classroom and your technical report's appendix."
      />
      {state.submittedAt ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-6 text-sm">
            <CheckCircle2 className="size-5 text-green-700" aria-hidden="true" />
            <span className="flex-1">
              Thank you. You evaluated {state.companyName} on{" "}
              {formatCalendarDate(new Date(state.submittedAt))}.
            </span>
            <a
              href={`/api/students/${profile.id}/company-evaluation/pdf`}
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <FileDown className="size-3.5" aria-hidden="true" />
              Download FM-VAA-052
            </a>
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
        <CompanyEvaluationForm studentProfileId={profile.id} companyName={state.companyName!} />
      )}
    </div>
  );
}
