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
import { ChecklistItemRow } from "./checklist-item-row";

export default async function ChecklistPage({ params }: { params: { studentProfileId: string } }) {
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const progress = await getChecklistProgress(params.studentProfileId);
  const isOwner = user.role === "STUDENT_INTERN";
  const canReview = !isOwner;

  const pendingCount = progress.items.filter((item) => item.status === "PENDING").length;
  const returnedCount = progress.items.filter((item) => item.status === "RETURNED").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="hidden shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary sm:block">
          <ClipboardCheck className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Pre-Deployment Checklist
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            All 9 requirements must be Approved before the endorsement letter can be released.
          </p>
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
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Checklist items</CardTitle>
              <CardDescription>
                {progress.gateSatisfied
                  ? "All requirements approved — endorsement letter is unblocked."
                  : "Upload the required document for each item, then wait for review."}
              </CardDescription>
            </div>
            <StatusBadge status={progress.gateSatisfied ? "APPROVED" : "PENDING"} />
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
                      {item.requirementType.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell
                      className="max-w-[16rem] truncate text-muted-foreground"
                      title={item.comments ?? undefined}
                    >
                      {item.comments ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <ChecklistItemRow
                        itemId={item.id}
                        requirementType={item.requirementType}
                        status={item.status}
                        hasFile={Boolean(item.filePath)}
                        canUpload={isOwner}
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
