import { redirect } from "next/navigation";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <Card>
      <CardHeader>
        <CardTitle>My Students</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption className="sr-only">Students in your assigned class groups</TableCaption>
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
                <TableCell>{student.studentNumber}</TableCell>
                <TableCell>{student.user.email}</TableCell>
                <TableCell>{student.program}</TableCell>
                <TableCell>{student.company?.name ?? "—"}</TableCell>
                <TableCell className="flex gap-3">
                  <Link href={`/students/${student.id}/checklist`} className="text-sm underline">
                    Checklist
                  </Link>
                  <Link href={`/students/${student.id}/work-plan`} className="text-sm underline">
                    Work Plan
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
