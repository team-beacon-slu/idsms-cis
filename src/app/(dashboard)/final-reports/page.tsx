import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import {
  FINAL_REPORT_REVIEWERS,
  listFinalReportsAwaitingReview,
} from "@/lib/services/finalReportService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Final reports" };

// Workstream H — the coordinator's queue of final reports awaiting review.
export default async function FinalReportsQueuePage() {
  const user = await requireUserPage();
  if (!FINAL_REPORT_REVIEWERS.includes(user.role)) redirect("/");
  const reports = await listFinalReportsAwaitingReview();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Final reports"
        description={`${reports.length} awaiting review, oldest submission first.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Awaiting review</CardTitle>
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
    </div>
  );
}
