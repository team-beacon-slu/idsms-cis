import Link from "next/link";
import { ArrowRight, ClipboardCheck, Download, Send, Users, UserX } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requestsAwaitingReviewByStudent } from "@/lib/services/attentionService";
import { getDeductionTally } from "@/lib/services/deductionService";
import { getComplianceRows, summarize } from "@/lib/services/complianceService";
import { ComplianceTable } from "@/components/compliance-table";
import { InternCharts } from "@/components/intern-charts";
import { StatCard, StatStrip } from "@/components/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BulkEndorsementButton } from "./my-students/bulk-endorsement-button";

const QUEUE_ROWS = 6;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// FR-DB-03: Faculty Adviser dashboard. Its question is "who is waiting for my review?",
// so the review queue leads, each row linking to the exact page to act on, then the
// compliance table for every student in the adviser's (class group, semester) pairs.
export async function FacultyDashboard({ facultyId }: { facultyId: string }) {
  const [rows, assigned] = await Promise.all([
    getComplianceRows({ kind: "faculty", facultyId }),
    prisma.facultyClassGroup.findMany({
      // Same scope as the KPIs: archived semesters are last term's cohort.
      where: { facultyId, semester: { archivedAt: null } },
      select: { classGroupId: true, semesterId: true, classGroup: { select: { name: true } } },
    }),
  ]);
  const summary = summarize(rows);
  const requests = await requestsAwaitingReviewByStudent(assigned);
  // shortcut: one tally per student (a few queries each); fine for a class
  // group of ~40, batch the loads if advisers get much larger rosters.
  const deductions = Object.fromEntries(
    await Promise.all(
      rows.map(
        async (r) =>
          [r.studentProfileId, (await getDeductionTally(r.studentProfileId)).totals] as const
      )
    )
  );
  // One bulk button per class group, even if advised across several semesters.
  const groupNames = new Map(assigned.map((g) => [g.classGroupId, g.classGroup.name]));

  const queue = rows.flatMap((r) => {
    const name = r.fullName || r.email;
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
        what: plural(pending, "leave or time request", "leave or time requests"),
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
            <p className="mt-2 text-sm text-muted-foreground">
              {plural(queue.length - QUEUE_ROWS, "more item", "more items")} in the table below.
            </p>
          )}
        </CardContent>
      </Card>

      <InternCharts rows={rows} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Interns</CardTitle>
              <CardDescription>
                Hours, documents and weekly reports for your assigned class groups.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/compliance/export"
                download
                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5")}
              >
                <Download className="size-4" aria-hidden="true" />
                Export to Excel
              </a>
              <a
                href="/api/compliance/weekly-summary"
                download
                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5")}
              >
                <Download className="size-4" aria-hidden="true" />
                Weekly summary (Excel)
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {groupNames.size > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {Array.from(groupNames).map(([id, name]) => (
                <div key={id} className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{name}</span>
                  <BulkEndorsementButton classGroupId={id} classGroupName={name} />
                </div>
              ))}
            </div>
          )}
          <ComplianceTable rows={rows} deductions={deductions} />
        </CardContent>
      </Card>
    </div>
  );
}
