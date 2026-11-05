import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { ClipboardCheck, Eye, FileText, Inbox } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getReviewQueue } from "@/lib/ai/reviewQueue";
import { jobsOnFor } from "@/lib/ai/jobs";
import { getAiSettings } from "@/lib/ai/settings";
import { formatCalendarDate } from "@/lib/documents/html";
import { QuickApprove } from "@/app/(dashboard)/students/[studentProfileId]/weekly-reports/quick-approve";
import { RequestReviewActions } from "@/app/(dashboard)/students/[studentProfileId]/leave-requests/request-review-actions";
import { getAdviserWaiting } from "@/lib/services/dashboards/waitingService";
import { ApproveUnflagged } from "./approve-unflagged";

export const metadata: Metadata = { title: "Review queue" };

// Job 7 + efficiency item 20: everything waiting on this adviser in one place. Weeks come
// first (flagged ones on top, each saying why), then checklist uploads, time requests, schedule changes.
export default async function ReviewQueuePage() {
  const user = await requireUserPage();
  if (user.role !== Role.FACULTY_ADVISER) redirect("/");
  const [on, { similarityThreshold }] = await Promise.all([jobsOnFor(user), getAiSettings()]);
  const [queue, waiting] = await Promise.all([
    getReviewQueue(user.id, { on, similarityThreshold }),
    getAdviserWaiting(user.id),
  ]);
  const unflagged = queue.filter((r) => r.reasons.length === 0).map((r) => r.id);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Review queue"
        description="Everything waiting for you. Weeks with something to check come first, and each says why; the order never decides anything. Approve here once the signed copy is in Google Classroom; open a week to return it with notes."
      />
      {unflagged.length > 1 && <ApproveUnflagged ids={unflagged} />}
      <Card>
        <CardContent className="pt-6">
          {queue.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nothing to review"
              description="Every submitted week has a decision."
            />
          ) : (
            <ul className="divide-y divide-border">
              {queue.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/students/${r.studentProfileId}/weekly-reports/${r.id}/review`}
                      prefetch={false}
                      className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                    >
                      {r.intern}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Week of {formatCalendarDate(r.weekStart)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <ul className="flex flex-wrap justify-end gap-1.5">
                      {r.reasons.length === 0 ? (
                        <li className="text-xs text-muted-foreground">Nothing flagged</li>
                      ) : (
                        r.reasons.map((reason) => (
                          <li
                            key={reason}
                            className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-900"
                          >
                            {reason}
                          </li>
                        ))
                      )}
                    </ul>
                    {/* A flagged week is opened before it is approved; the rest stay one click. */}
                    {r.reasons.length > 0 ? (
                      <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <Link
                          href={`/students/${r.studentProfileId}/weekly-reports/${r.id}/review`}
                          prefetch={false}
                        >
                          <Eye className="size-3.5" aria-hidden="true" />
                          Review
                        </Link>
                      </Button>
                    ) : (
                      <QuickApprove weeklyReportId={r.id} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {waiting.uploadedChecklist > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
              {waiting.uploadedChecklist} checklist{" "}
              {waiting.uploadedChecklist === 1 ? "item" : "items"} marked uploaded to Classroom
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/my-students/checklist" prefetch={false}>
                Open the class grid
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {waiting.timeRequests.length > 0 && (
        <section aria-labelledby="time-requests" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="time-requests" className="text-lg font-semibold text-foreground">
              Time requests ({waiting.timeRequests.length})
            </h2>
            {waiting.timeRequests.length > 1 && (
              <ApproveUnflagged ids={waiting.timeRequests.map((r) => r.id)} kind="request" />
            )}
          </div>
          <Card>
            <CardContent className="pt-6">
              <ul className="divide-y divide-border">
                {waiting.timeRequests.map((r) => {
                  const label = `${r.kind} on ${formatCalendarDate(r.date)} for ${r.intern}`;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <Link
                          href={r.href}
                          prefetch={false}
                          className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                        >
                          {r.intern}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {r.kind} · {formatCalendarDate(r.date)}
                        </p>
                        <p className="text-sm whitespace-pre-wrap text-foreground">{r.reason}</p>
                        {r.hasProof && (
                          <a
                            href={`/api/deviations/${r.id}/proof`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
                          >
                            <FileText className="size-3.5" aria-hidden="true" />
                            View proof
                          </a>
                        )}
                      </div>
                      <RequestReviewActions requestId={r.id} label={label} canApprove />
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {waiting.scheduleChanges.length > 0 && (
        <section aria-labelledby="schedule-changes" className="space-y-3">
          <h2 id="schedule-changes" className="text-lg font-semibold text-foreground">
            Schedule changes ({waiting.scheduleChanges.length})
          </h2>
          <Card>
            <CardContent className="pt-6">
              <ul className="divide-y divide-border">
                {waiting.scheduleChanges.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 py-3">
                    <span className="font-medium text-foreground">{c.intern}</span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={c.href} prefetch={false}>
                        Validate
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
