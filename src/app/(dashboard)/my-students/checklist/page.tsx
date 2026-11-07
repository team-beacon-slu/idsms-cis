import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChecklistRequirementType, Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChecklistGrid, type GridRow } from "./checklist-grid";
import { displayName } from "@/lib/utils/displayName";

export const metadata: Metadata = { title: "Class checklist" };

// Efficiency plan item 19: every intern's requirements on one screen, so an adviser
// approves what interns marked "Uploaded to Classroom" in one go instead of ~9 page visits
// per intern. Returning still needs a note, on the intern's own checklist page.
export default async function ClassChecklistPage() {
  const user = await requireUserPage();
  if (user.role !== Role.FACULTY_ADVISER) redirect("/");

  const groups = await prisma.facultyClassGroup.findMany({
    where: { facultyId: user.id, semester: { archivedAt: null } },
    select: { classGroupId: true, semesterId: true },
  });
  const students = groups.length
    ? await prisma.studentProfile.findMany({
        where: {
          deletedAt: null,
          OR: groups.map((g) => ({ classGroupId: g.classGroupId, semesterId: g.semesterId })),
        },
        select: {
          id: true,
          fullName: true,
          studentNumber: true,
          user: { select: { email: true } },
          checklistItems: {
            where: { archivedAt: null },
            select: { id: true, requirementType: true, status: true, uploadedAt: true },
          },
        },
        orderBy: { studentNumber: "asc" },
      })
    : [];

  // Columns: the requirement types any of these interns has, in the checklist's own order.
  const present = new Set(students.flatMap((s) => s.checklistItems.map((i) => i.requirementType)));
  const columns = Object.values(ChecklistRequirementType).filter((t) => present.has(t));
  const rows: GridRow[] = students.map((s) => ({
    studentId: s.id,
    name: displayName({ ...s, email: s.user.email }),
    items: Object.fromEntries(
      s.checklistItems.map((i) => [
        i.requirementType,
        { id: i.id, status: i.status, uploaded: i.uploadedAt !== null },
      ])
    ),
  }));
  const uploaded = rows.reduce(
    (n, r) =>
      n + Object.values(r.items).filter((i) => i.uploaded && i.status !== "APPROVED").length,
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class checklist"
        description={`${students.length} ${students.length === 1 ? "intern" : "interns"} · ${uploaded} ${uploaded === 1 ? "item" : "items"} marked uploaded to Classroom`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Approve requirements</CardTitle>
          <CardDescription>
            Check the file on Google Classroom, tick what is right, then approve them together. To
            return an item, open the intern&apos;s checklist (their name) so you can add a note. The
            work plan and MOA can only be approved once those are approved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No interns yet.{" "}
              <Link href="/my-students" className="underline">
                My students
              </Link>
            </p>
          ) : (
            <ChecklistGrid rows={rows} columns={columns} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
