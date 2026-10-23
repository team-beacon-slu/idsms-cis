import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { Role } from "@prisma/client";
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

export const metadata: Metadata = { title: "My students" };

// Weekly reports open from the intern's name; these are the other records.
const ACTION_LINKS = [
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="My students"
        description={`${students.length} ${students.length === 1 ? "intern" : "interns"} in ${classGroups.length} ${classGroups.length === 1 ? "class group" : "class groups"}`}
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
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableCaption className="sr-only">
                Students in your assigned class groups
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Intern</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <Link
                        href={`/students/${student.id}/weekly-reports`}
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
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {ACTION_LINKS.map(({ suffix, label }) => (
                          <Link
                            key={suffix}
                            href={`/students/${student.id}/${suffix}`}
                            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            {label}
                          </Link>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {students.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-sm text-muted-foreground">
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
