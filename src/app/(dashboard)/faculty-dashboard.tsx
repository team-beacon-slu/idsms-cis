import Link from "next/link";
import { CalendarOff, ClipboardCheck, Download, Send, Users, UserX } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { countRequestsAwaitingReview } from "@/lib/services/attentionService";
import { getComplianceRows, summarize } from "@/lib/services/complianceService";
import { ComplianceTable } from "@/components/compliance-table";
import { StatCard } from "@/components/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BulkEndorsementButton } from "./my-students/bulk-endorsement-button";

// FR-DB-03: Faculty Adviser dashboard — KPI row plus the compliance table for
// every student in the adviser's (class group, semester) pairs.
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
  const requestsAwaiting = await countRequestsAwaitingReview(assigned);
  // One bulk button per class group, even if advised across several semesters.
  const groupNames = new Map(assigned.map((g) => [g.classGroupId, g.classGroup.name]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total students" value={summary.total} icon={Users} tone="blue" />
        <StatCard
          label="Submitted this week"
          value={summary.submittedThisWeek}
          icon={Send}
          tone="green"
        />
        <StatCard
          label="Pending review"
          value={summary.pendingReview}
          icon={ClipboardCheck}
          tone={summary.pendingReview > 0 ? "amber" : "slate"}
        />
        <StatCard
          label="Not yet submitted"
          value={summary.notYetSubmitted}
          icon={UserX}
          tone={summary.notYetSubmitted > 0 ? "red" : "slate"}
        />
      </div>

      {requestsAwaiting > 0 && (
        <Link
          href="/my-students"
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 transition-colors duration-200 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <CalendarOff className="size-4" aria-hidden="true" />
          {requestsAwaiting} leave / time {requestsAwaiting === 1 ? "request" : "requests"} awaiting
          your review — open a student&apos;s Leave &amp; Time Requests tab
        </Link>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>My students</CardTitle>
              <CardDescription>
                Hours, documents and weekly reports for your assigned class groups.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/compliance/export"
                download
                className={cn(
                  buttonVariants({ size: "sm", variant: "outline" }),
                  "cursor-pointer gap-1.5 transition-colors duration-200"
                )}
              >
                <Download className="size-4" aria-hidden="true" />
                Export to Excel
              </a>
              <a
                href="/api/compliance/weekly-summary"
                download
                className={cn(
                  buttonVariants({ size: "sm", variant: "outline" }),
                  "cursor-pointer gap-1.5 transition-colors duration-200"
                )}
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
          <ComplianceTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
