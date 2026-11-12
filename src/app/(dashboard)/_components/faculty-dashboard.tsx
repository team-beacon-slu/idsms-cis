import Link from "next/link";
import { ArrowRight, ClipboardCheck, Send, Users, UserX } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requestsAwaitingReviewByStudent } from "@/lib/services/dashboards/attentionService";
import { getDeductionTallies } from "@/lib/services/conduct/deductionService";
import {
  getComplianceRows,
  getComplianceStudentIds,
  summarize,
} from "@/lib/services/dashboards/complianceService";
import { ComplianceTable } from "@/components/compliance-table";
import { InternCharts } from "@/components/intern-charts";
import { StatCard, StatStrip } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { displayName } from "@/lib/utils/displayName";

const QUEUE_ROWS = 6;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// FR-DB-03: Faculty Adviser dashboard. Its question is "who is waiting for my review?",
// so the review queue leads, each row linking to the exact page to act on, then the
// compliance table for every student in the adviser's (class group, semester) pairs.
export async function FacultyDashboard({ facultyId }: { facultyId: string }) {
  // One scope object, so the rows and the ids share a single scope lookup (requestCache).
  const scope = { kind: "faculty", facultyId } as const;
  const assignedLoad = prisma.facultyClassGroup.findMany({
    // Same scope as the KPIs: archived semesters are last term's cohort.
    where: { facultyId, semester: { archivedAt: null } },
    select: { classGroupId: true, semesterId: true },
  });
  // Each load starts as soon as its own input is ready instead of waiting for the full table;
  // every advisee's tally takes a fixed handful of queries.
  const [rows, requests, tallies] = await Promise.all([
    getComplianceRows(scope),
    assignedLoad.then(requestsAwaitingReviewByStudent),
    getComplianceStudentIds(scope).then((ids) => getDeductionTallies(ids)),
  ]);
  const summary = summarize(rows);
  const deductions = Object.fromEntries(
    [...tallies].map(([id, tally]) => [id, tally.totals] as const)
  );

  const queue = rows.flatMap((r) => {
    const name = displayName(r);
    const items = [];
    if (r.awaitingReview > 0) {
      items.push({
        key: `${r.studentProfileId}-wr`,
        name,
        what: plural(r.awaitingReview, "weekly report", "weekly reports"),
        href: `/students/${r.studentProfileId}/weekly-reports`,
      });
    }
    const pending = requests.get(r.studentProfileId) ?? 0;
    if (pending > 0) {
      items.push({
        key: `${r.studentProfileId}-lr`,
        name,
        what: plural(pending, "overtime or absence reason", "overtime or absence reasons"),
        href: `/students/${r.studentProfileId}/leave-requests`,
      });
    }
    return items;
  });
  const waiting = summary.pendingReview + [...requests.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <StatStrip>
        <StatCard label="Interns" value={summary.total} icon={Users} />
        <StatCard label="Submitted this week" value={summary.submittedThisWeek} icon={Send} />
        <StatCard label="Waiting for your review" value={waiting} icon={ClipboardCheck} action />
        <StatCard label="Not yet submitted" value={summary.notYetSubmitted} icon={UserX} />
      </StatStrip>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Waiting for your review</CardTitle>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing is waiting for your review. New submissions appear here.
            </p>
          ) : (
            <ul className="-mx-2">
              {queue.slice(0, QUEUE_ROWS).map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                    <span className="text-muted-foreground">{item.what}</span>
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {queue.length > QUEUE_ROWS && (
            <p className="mt-2 text-sm">
              <Link
                href="/review-queue"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {plural(queue.length - QUEUE_ROWS, "more item", "more items")}
              </Link>{" "}
              <span className="text-muted-foreground">in your review queue.</span>
            </p>
          )}
        </CardContent>
      </Card>

      <InternCharts rows={rows} />

      <Card>
        <CardHeader>
          <CardTitle>Interns</CardTitle>
          {/* Efficiency item 38: exports and endorsement letters live on My students; home is
              for what waits on the adviser. */}
          <CardDescription>
            Hours, documents and weekly reports for your assigned class groups. Exports and
            endorsement letters are on{" "}
            <Link
              href="/my-students"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              My students
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ComplianceTable rows={rows} deductions={deductions} />
        </CardContent>
      </Card>
    </div>
  );
}
