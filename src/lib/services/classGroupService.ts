import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import {
  assignAdviserSchema,
  createClassGroupSchema,
  renameClassGroupSchema,
} from "@/lib/validators/classGroup";

// Class groups and who advises them. Advisers only see interns through these
// assignments (assertCanAccessStudent), and the class-list import files students
// into a group, so a fresh install needs both before anyone can work.
export class ClassGroupStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassGroupStateError";
  }
}

export async function listClassGroups() {
  return prisma.classGroup.findMany({
    where: { deletedAt: null },
    orderBy: [{ program: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      program: true,
      classType: true,
      startDate: true,
      endDate: true,
      _count: { select: { students: true } },
      facultyGroups: {
        orderBy: { semester: { startDate: "desc" } },
        select: {
          id: true,
          faculty: { select: { email: true, fullName: true } },
          semester: { select: { name: true, academicYear: true } },
        },
      },
    },
  });
}

// Active faculty advisers, for the assign picker.
export async function listAdviserOptions() {
  return prisma.user.findMany({
    where: { role: Role.FACULTY_ADVISER, isActive: true, deletedAt: null },
    orderBy: { email: "asc" },
    select: { id: true, email: true, fullName: true },
  });
}

export async function createClassGroup(
  input: unknown,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ id: string }> {
  const data = createClassGroupSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const created = await tx.classGroup.create({ data, select: { id: true } });
    await logEvent(
      {
        userId: actingUserId,
        action: "CLASS_GROUP_CREATED",
        entityType: "ClassGroup",
        entityId: created.id,
        ipAddress,
        detail: { name: data.name, program: data.program },
      },
      tx
    );
    return created;
  });
}

export async function renameClassGroup(
  classGroupId: string,
  input: unknown,
  actingUserId: string,
  ipAddress?: string | null
): Promise<void> {
  const { name } = renameClassGroupSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const before = await tx.classGroup.findUnique({
      where: { id: classGroupId },
      select: { name: true, deletedAt: true },
    });
    if (!before || before.deletedAt) {
      throw new ClassGroupStateError("That class group no longer exists");
    }
    await tx.classGroup.update({ where: { id: classGroupId }, data: { name } });
    await logEvent(
      {
        userId: actingUserId,
        action: "CLASS_GROUP_RENAMED",
        entityType: "ClassGroup",
        entityId: classGroupId,
        ipAddress,
        detail: { from: before.name, to: name },
      },
      tx
    );
  });
}

// Soft delete, and only while empty: interns filed in a group would lose their adviser's view.
export async function deleteClassGroup(
  classGroupId: string,
  actingUserId: string,
  ipAddress?: string | null
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const group = await tx.classGroup.findUnique({
      where: { id: classGroupId },
      select: { name: true, deletedAt: true, _count: { select: { students: true } } },
    });
    if (!group || group.deletedAt) {
      throw new ClassGroupStateError("That class group no longer exists");
    }
    if (group._count.students > 0) {
      throw new ClassGroupStateError("Move or remove this group's interns before deleting it");
    }
    await tx.facultyClassGroup.deleteMany({ where: { classGroupId } });
    await tx.classGroup.update({ where: { id: classGroupId }, data: { deletedAt: new Date() } });
    await logEvent(
      {
        userId: actingUserId,
        action: "CLASS_GROUP_DELETED",
        entityType: "ClassGroup",
        entityId: classGroupId,
        ipAddress,
        detail: { name: group.name },
      },
      tx
    );
  });
}

export async function assignAdviser(
  classGroupId: string,
  input: unknown,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ id: string }> {
  const { facultyId, semesterId } = assignAdviserSchema.parse(input);
  const [group, faculty, semester] = await Promise.all([
    prisma.classGroup.findUnique({ where: { id: classGroupId }, select: { deletedAt: true } }),
    prisma.user.findUnique({
      where: { id: facultyId },
      select: { role: true, isActive: true, deletedAt: true },
    }),
    prisma.semester.findUnique({ where: { id: semesterId }, select: { archivedAt: true } }),
  ]);
  if (!group || group.deletedAt)
    throw new ClassGroupStateError("That class group no longer exists");
  if (!faculty || faculty.deletedAt || !faculty.isActive || faculty.role !== Role.FACULTY_ADVISER) {
    throw new ClassGroupStateError("Only an active faculty adviser can be assigned");
  }
  if (!semester || semester.archivedAt) {
    throw new ClassGroupStateError("Choose a semester that isn't archived");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.facultyClassGroup.findFirst({
      where: { facultyId, classGroupId, semesterId },
      select: { id: true },
    });
    if (existing)
      throw new ClassGroupStateError("That adviser is already assigned for this semester");
    const created = await tx.facultyClassGroup.create({
      data: { facultyId, classGroupId, semesterId },
      select: { id: true },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "ADVISER_ASSIGNED",
        entityType: "ClassGroup",
        entityId: classGroupId,
        ipAddress,
        detail: { facultyId, semesterId },
      },
      tx
    );
    return created;
  });
}

export async function removeAdviser(
  assignmentId: string,
  actingUserId: string,
  ipAddress?: string | null
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const removed = await tx.facultyClassGroup.delete({
      where: { id: assignmentId },
      select: { classGroupId: true, facultyId: true, semesterId: true },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "ADVISER_UNASSIGNED",
        entityType: "ClassGroup",
        entityId: removed.classGroupId,
        ipAddress,
        detail: { facultyId: removed.facultyId, semesterId: removed.semesterId },
      },
      tx
    );
  });
}
