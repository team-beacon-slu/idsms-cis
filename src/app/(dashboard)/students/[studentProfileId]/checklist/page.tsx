import { redirect } from "next/navigation";
import { ClipboardCheck, CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getChecklistProgress } from "@/lib/services/checklistService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { getEndorsementLetterDocument } from "@/lib/services/documentService";
import { ChecklistItemRow } from "./checklist-item-row";
import { EndorsementLetterActions } from "./endorsement-letter-actions";

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
      <div className="flex items-start gap-3">
        <div className="bg-primary/10 text-primary hidden shrink-0 rounded-lg p-2.5 sm:block">
          <ClipboardCheck className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Pre-Deployment Checklist
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            All 9 requirements must be Approved before the endorsement letter can be released.
          </p>
          {isOwner && (
            <p className="text-foreground mt-2 max-w-2xl text-sm">
              Submit this document in Google Classroom. Your adviser will update its status here.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Approved"
          value={`${progress.approvedCount} / ${progress.total}`}
          icon={CheckCircle2}
          tone="green"
          hint={`${progress.percentage}% complete`}
        />
        <StatCard label="Pending" value={pendingCount} icon={Clock3} tone="amber" />
        <StatCard label="Returned" value={returnedCount} icon={RotateCcw} tone="red" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Endorsement letter</CardTitle>
              <CardDescription>
                {progress.gateSatisfied
                  ? "Issued by the department once all requirements are approved."
                  : "Available once all 9 requirements are approved."}
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

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Checklist items</CardTitle>
              <CardDescription>
                {progress.gateSatisfied
                  ? "All requirements approved — endorsement letter is unblocked."
                  : "Your adviser updates each item's status after checking your submission."}
              </CardDescription>
            </div>
            <StatusBadge status={progress.gateSatisfied ? "APPROVED" : "PENDING"} />
          </div>
          <div
            className="bg-muted h-2 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={progress.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Checklist completion"
          >
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
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
                    <TableCell className="text-foreground font-medium">
                      {item.requirementType.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[16rem] wrap-break-word">
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
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
