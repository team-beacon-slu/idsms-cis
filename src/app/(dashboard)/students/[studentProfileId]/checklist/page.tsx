import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getChecklistProgress } from "@/lib/services/predeployment/checklistService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard, StatStrip } from "@/components/stat-card";
import { requirementLabel } from "@/lib/utils/requirementLabel";
import { StatusBadge } from "@/components/status-badge";
import { getEndorsementLetterDocument } from "@/lib/services/reports/documentService";
import { ChecklistItemRow } from "./checklist-item-row";
import { EndorsementLetterActions } from "./endorsement-letter-actions";
import { StartBeforeMoa } from "./start-before-moa";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Checklist" };

export default async function ChecklistPage(props: {
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

  const [progress, letter] = await Promise.all([
    getChecklistProgress(params.studentProfileId),
    getEndorsementLetterDocument(params.studentProfileId),
  ]);
  const isOwner = user.role === "STUDENT_INTERN";
  const canReview = !isOwner;

  const pendingCount = progress.items.filter((item) => item.status === "PENDING").length;
  const returnedCount = progress.items.filter((item) => item.status === "RETURNED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Checklist"
        description={
          isOwner
            ? `Pre-deployment requirements, submitted in Google Classroom. Your adviser updates each status here; ${progress.total} are required.`
            : `Pre-deployment requirements; the ${progress.total} required ones must be approved before the endorsement letter.`
        }
      />

      <StatStrip>
        <StatCard
          label="Approved"
          value={`${progress.approvedCount} / ${progress.total}`}
          icon={CheckCircle2}

          hint={`${progress.percentage}% complete`}
        />
        <StatCard label="Pending" value={pendingCount} icon={Clock3} />
        <StatCard label="Returned" value={returnedCount} icon={RotateCcw} />
      </StatStrip>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Endorsement letter</CardTitle>
              <CardDescription>
                {progress.gateSatisfied
                  ? "Issued by the department once all requirements are approved."
                  : `Available once all ${progress.total} required items are approved.`}
              </CardDescription>
            </div>
            <EndorsementLetterActions
              studentProfileId={params.studentProfileId}
              status={letter?.status ?? null}
              canGenerate={canReview && progress.gateSatisfied}
            />
          </div>
        </CardHeader>
      </Card>

      <StartBeforeMoa
        studentProfileId={params.studentProfileId}
        allowed={progress.startBeforeMoa.allowed}
        reason={progress.startBeforeMoa.reason}
        canEdit={canReview}
      />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Checklist items</CardTitle>
              <CardDescription>
                {progress.gateSatisfied
                  ? "All requirements approved — endorsement letter is unblocked."
                  : `${progress.approvedCount} of ${progress.total} approved.`}
              </CardDescription>
            </div>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Checklist completion"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableCaption className="sr-only">Pre-deployment checklist items</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progress.items.map((item) => (
                  <TableRow key={item.id} className="transition-colors">
                    <TableCell className="font-medium text-foreground">
                      {requirementLabel(item.requirementType)}
                      {!item.required && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          optional
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="max-w-[16rem] wrap-break-word text-muted-foreground">
                      {item.comments
                        ? item.status === "RETURNED"
                          ? `Adviser's note: ${item.comments}`
                          : item.comments
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <ChecklistItemRow
                        itemId={item.id}
                        status={item.status}
                        canReview={canReview}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {progress.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      No requirements are tracked for this intern yet. The coordinator adds them
                      when the intern is imported.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
