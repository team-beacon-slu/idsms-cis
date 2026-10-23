import { redirect } from "next/navigation";
import { Program, Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { listAdviserOptions, listClassGroups } from "@/lib/services/academic/classGroupService";
import { listSemesters } from "@/lib/services/academic/semesterService";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AssignAdviserForm,
  ClassGroupActions,
  NewClassGroupForm,
  RemoveAdviserButton,
} from "./class-group-forms";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Class groups" };

const MANAGERS: Role[] = [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

export default async function ClassGroupsPage() {
  const user = await requireUserPage();
  if (!MANAGERS.includes(user.role)) redirect("/");

  const [groups, advisers, semesters] = await Promise.all([
    listClassGroups(),
    listAdviserOptions(),
    listSemesters(),
  ]);
  const openSemesters = semesters.filter((s) => !s.archivedAt);
  const semesterOptions = openSemesters.map((s) => ({
    id: s.id,
    label: `${s.name} (${s.academicYear})${s.isActive ? " · active" : ""}`,
  }));
  const adviserOptions = advisers.map((a) => ({
    id: a.id,
    label: a.fullName ? `${a.fullName} (${a.email})` : a.email,
  }));
  const activeSemesterId = openSemesters.find((s) => s.isActive)?.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class groups"
        description={`${groups.length} ${groups.length === 1 ? "group" : "groups"}. Advisers see the interns of the groups they are assigned to; the class-list import files interns into a group.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>New class group</CardTitle>
          <CardDescription>One per section, e.g. BSIT 4A.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewClassGroupForm programs={Object.values(Program)} />
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No class groups yet. Create the first one above, then assign its adviser.
        </p>
      ) : (
        groups.map((g) => (
          <Card key={g.id}>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>{g.name}</CardTitle>
                <CardDescription>
                  {g.program} · {g.classType} · {g._count.students}{" "}
                  {g._count.students === 1 ? "intern" : "interns"}
                </CardDescription>
              </div>
              <ClassGroupActions
                classGroupId={g.id}
                name={g.name}
                internCount={g._count.students}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {g.facultyGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No adviser assigned yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {g.facultyGroups.map((fg) => (
                    <li
                      key={fg.id}
                      className="flex min-h-11 items-center justify-between gap-3 px-3"
                    >
                      <span className="min-w-0 text-sm">
                        <span className="font-medium text-foreground">
                          {fg.faculty.fullName || fg.faculty.email}
                        </span>
                        {fg.faculty.fullName && (
                          <span className="text-muted-foreground"> · {fg.faculty.email}</span>
                        )}
                        <span className="text-muted-foreground">
                          {" "}
                          · {fg.semester.name} ({fg.semester.academicYear})
                        </span>
                      </span>
                      <RemoveAdviserButton
                        assignmentId={fg.id}
                        label={fg.faculty.fullName || fg.faculty.email}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <AssignAdviserForm
                classGroupId={g.id}
                advisers={adviserOptions}
                semesters={semesterOptions}
                defaultSemesterId={activeSemesterId}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
