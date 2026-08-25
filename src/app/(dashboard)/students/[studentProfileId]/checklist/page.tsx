import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getChecklistProgress } from "@/lib/services/checklistService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Pre-Deployment Checklist
          <Badge
            variant={progress.gateSatisfied ? "outline" : "secondary"}
            role="status"
            aria-live="polite"
          >
            {progress.approvedCount}/{progress.total} ({progress.percentage}%)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption className="sr-only">Pre-deployment checklist items</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Requirement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Comments</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {progress.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.requirementType.replaceAll("_", " ")}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.status === "APPROVED"
                        ? "outline"
                        : item.status === "RETURNED"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>{item.comments ?? "—"}</TableCell>
                <TableCell>
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
      </CardContent>
    </Card>
  );
}
