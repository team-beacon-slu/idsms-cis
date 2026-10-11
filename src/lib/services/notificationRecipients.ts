import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getStudentUserId(studentProfileId: string): Promise<string | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { userId: true },
  });
  return profile?.userId ?? null;
}

export async function getAssignedFacultyIds(studentProfileId: string): Promise<string[]> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { classGroupId: true, semesterId: true },
  });
  if (!profile) return [];
  const links = await prisma.facultyClassGroup.findMany({
    where: { classGroupId: profile.classGroupId, semesterId: profile.semesterId },
    select: { facultyId: true },
  });
  return Array.from(new Set(links.map((l) => l.facultyId)));
}

export async function getDepartmentStaffIds(): Promise<string[]> {
  const staff = await prisma.user.findMany({
    where: {
      role: { in: [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  return staff.map((s) => s.id);
}
