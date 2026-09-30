import { redirect } from "next/navigation";
import Link from "next/link";
import { Role } from "@prisma/client";
import { Users, ClipboardCheck, NotebookText, Clock, FileText, FileBarChart } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ACTION_LINKS = [
  { suffix: "checklist", label: "Checklist", icon: ClipboardCheck },
  { suffix: "work-plan", label: "Work Plan", icon: NotebookText },
  { suffix: "attendance", label: "Attendance", icon: Clock },
  { suffix: "weekly-reports", label: "Weekly Reports", icon: FileText },
  { suffix: "monthly-reports", label: "Monthly Reports", icon: FileBarChart },
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
    select: { classGroupId: true, semesterId: true },
  });

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Students in your assigned class groups.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Assigned class groups"
          value={classGroups.length}
          icon={ClipboardCheck}
          tone="blue"
        />
        <StatCard label="Students" value={students.length} icon={Users} tone="green" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>
            Jump into any student&apos;s checklist, work plan, or reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableCaption className="sr-only">
                Students in your assigned class groups
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Student number</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium text-foreground">
                      {student.studentNumber}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{student.user.email}</TableCell>
                    <TableCell>{student.program}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {student.company?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {ACTION_LINKS.map(({ suffix, label, icon: Icon }) => (
                          <Link
                            key={suffix}
                            href={`/students/${student.id}/${suffix}`}
                            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary transition-colors duration-200 hover:text-primary/80 hover:underline"
                          >
                            <Icon className="size-3.5" aria-hidden="true" />
                            {label}
                          </Link>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {students.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-14 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Users className="size-5" aria-hidden="true" />
                        </div>
                        <p className="text-sm font-medium text-foreground">No students yet</p>
                        <p className="text-sm text-muted-foreground">
                          Students appear here once assigned to one of your class groups.
                        </p>
                      </div>
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
