import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { Role, WeeklyReportStatus } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BulkEndorsementButton } from "./bulk-endorsement-button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Metadata } from "next";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAwaitingReview } from "@/lib/services/reports/weeklyReportService";
import { requestsAwaitingReviewByStudent } from "@/lib/services/dashboards/attentionService";

export const metadata: Metadata = { title: "My students" };

// Weekly reports open from the intern's name; these are the other records.
const ACTION_LINKS = [
  { suffix: "weekly-reports", label: "Weekly reports" },
  { suffix: "checklist", label: "Checklist" },
  { suffix: "work-plan", label: "Work plan" },
  { suffix: "attendance", label: "Attendance" },
  { suffix: "leave-requests", label: "Leave & time" },
  { suffix: "monthly-reports", label: "Monthly reports" },
] as const;

// Minimal roster so a Faculty Adviser has an entry point to reach a specific
// student's checklist/work-plan pages — not named in the FR-CK/FR-WP text
// directly, but without it there's no way to reach those pages at all.
export default async function MyStudentsPage() {
  const user = await requireUserPage();
  if (user.role !== Role.FACULTY_ADVISER) {
    redirect("/");
  }

  const classGroups = await prisma.facultyClassGroup.findMany({
    where: { facultyId: user.id },
    select: { classGroupId: true, semesterId: true, classGroup: { select: { name: true } } },
  });
  // One bulk button per class group, even if advised across several semesters.
  const groupNames = new Map(classGroups.map((g) => [g.classGroupId, g.classGroup.name]));

  // An empty OR: [] is not safe to trust as "no filter" here — a Faculty
  // Adviser with zero assigned groups must see zero students, not everyone.
  const students =
    classGroups.length === 0
      ? []
      : await prisma.studentProfile.findMany({
          where: {
            OR: classGroups.map((g) => ({
              classGroupId: g.classGroupId,
              semesterId: g.semesterId,
            })),
          },
          include: { user: { select: { email: true } }, company: { select: { name: true } } },
          orderBy: { studentNumber: "asc" },
        });

  // What waits on the adviser per intern: submitted weeks and time requests.
  const assigned = classGroups.map((g) => ({
    classGroupId: g.classGroupId,
    semesterId: g.semesterId,
  }));
  const ids = students.map((s) => s.id);
  const [pendingWeeks, requests] = await Promise.all([
    ids.length
      ? prisma.weeklyReport.findMany({
          where: { studentProfileId: { in: ids }, status: WeeklyReportStatus.PENDING },
          select: { studentProfileId: true, status: true, revisionHistory: true },
        })
      : [],
    requestsAwaitingReviewByStudent(assigned),
  ]);
  const waiting = new Map<string, number>(requests);
  for (const r of pendingWeeks.filter(isAwaitingReview)) {
    waiting.set(r.studentProfileId, (waiting.get(r.studentProfileId) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My students"
        description={`${students.length} ${students.length === 1 ? "intern" : "interns"} in ${classGroups.length} ${classGroups.length === 1 ? "class group" : "class groups"}`}
        actions={
          students.length > 0 && (
            <Button asChild variant="outline" className="gap-1.5">
              <Link href="/my-students/checklist" prefetch={false}>
                <ClipboardCheck className="size-4" aria-hidden="true" />
                Class checklist
              </Link>
            </Button>
          )
        }
      />

      {groupNames.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Endorsement letters</CardTitle>
            <CardDescription>
              Generate letters for a whole class group. Students without all 9 requirements approved
              are skipped.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Array.from(groupNames).map(([id, name]) => (
              <div key={id} className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{name}</span>
                <BulkEndorsementButton classGroupId={id} classGroupName={name} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>
            Open an intern&apos;s weekly reports from their name, or another record from Open.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Phones: one card per intern (the table was ~7,800 px tall at 390 px wide). */}
          <ul className="space-y-2 sm:hidden">
            {students.map((student) => (
              <li key={student.id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/students/${student.id}/weekly-reports`}
                    prefetch={false}
                    className="min-w-0 font-medium break-words text-foreground underline-offset-4 hover:underline"
                  >
                    {student.fullName || student.user.email}
                  </Link>
                  <WaitingBadge count={waiting.get(student.id) ?? 0} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {student.studentNumber} · {student.program} ·{" "}
                  {student.company?.name ?? "No company yet"}
                </p>
                <OpenMenu studentId={student.id} />
              </li>
            ))}
            {students.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">
                No interns yet. They appear here once assigned to one of your class groups.
              </li>
            )}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card sm:block">
            <Table>
              <TableCaption className="sr-only">
                Students in your assigned class groups
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Intern</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead>Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <Link
                        href={`/students/${student.id}/weekly-reports`}
                        prefetch={false}
                        className="block font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {student.fullName || student.user.email}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {student.studentNumber}
                        {student.fullName ? ` · ${student.user.email}` : null}
                      </span>
                    </TableCell>
                    <TableCell>{student.program}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {student.company?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <WaitingBadge count={waiting.get(student.id) ?? 0} />
                    </TableCell>
                    <TableCell>
                      <OpenMenu studentId={student.id} />
                    </TableCell>
                  </TableRow>
                ))}
                {students.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-sm text-muted-foreground">
                      No interns yet. They appear here once assigned to one of your class groups.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WaitingBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="inline-flex shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-brand-900 tabular-nums">
      {count} waiting
    </span>
  );
}

// One menu instead of five inline links: no JavaScript, full-size targets (WCAG 2.5.8).
// It opens in place (the table scrolls, which would clip a floating menu).
function OpenMenu({ studentId }: { studentId: string }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-md border border-input px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden [&::-webkit-details-marker]:hidden">
        Open
        <ChevronDown
          className="size-3.5 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul className="mt-1 w-48 rounded-md border border-border bg-popover p-1">
        {ACTION_LINKS.map(({ suffix, label }) => (
          <li key={suffix}>
            <Link
              href={`/students/${studentId}/${suffix}`}
              // Every page is dynamic: prefetching each intern's records re-ran them on the server.
              prefetch={false}
              className="flex min-h-10 items-center rounded px-2.5 text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
