import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import {
  FINAL_REPORT_REVIEWERS,
  listFinalReportsAwaitingReview,
} from "@/lib/services/finalReportService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Workstream H — the coordinator's queue of final reports awaiting review.
export default async function FinalReportsQueuePage() {
  const user = await requireUserPage();
  if (!FINAL_REPORT_REVIEWERS.includes(user.role)) redirect("/");
  const reports = await listFinalReportsAwaitingReview();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Final reports awaiting review</CardTitle>
        <CardDescription>Oldest submission first.</CardDescription>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          <ul className="divide-y">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {r.studentProfile.fullName ?? r.studentProfile.studentNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.studentProfile.program} · {r.studentProfile.user.email} · submitted{" "}
                    {r.submittedAt?.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}
                  </p>
                </div>
                <Link
                  href={`/students/${r.studentProfileId}/final-report`}
                  className="text-sm text-primary underline"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
