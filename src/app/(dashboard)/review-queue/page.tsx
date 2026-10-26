import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { Inbox } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { getReviewQueue } from "@/lib/ai/reviewQueue";
import { jobsOnFor } from "@/lib/ai/jobs";
import { getAiSettings } from "@/lib/ai/settings";
import { formatCalendarDate } from "@/lib/documents/html";

export const metadata: Metadata = { title: "Review queue" };

// Job 7: every week waiting on this adviser, flagged weeks first, each row saying why.
export default async function ReviewQueuePage() {
  const user = await requireUserPage();
  if (user.role !== Role.FACULTY_ADVISER) redirect("/");
  const [on, { similarityThreshold }] = await Promise.all([jobsOnFor(user), getAiSettings()]);
  const queue = await getReviewQueue(user.id, { on, similarityThreshold });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Review queue"
        description="Weekly reports waiting for you. Weeks with something to check come first, and each says why; the order never decides anything."
      />
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
                      className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                    >
                      {r.intern}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Week of {formatCalendarDate(r.weekStart)}
                    </p>
                  </div>
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
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
