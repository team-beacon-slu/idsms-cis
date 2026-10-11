import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { createSemesterSchema } from "@/lib/validators/semester";

// Raised when a semester can't make the requested state change; carries a
// message written for the admin so the UI can show it verbatim.
export class SemesterStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemesterStateError";
  }
}

export async function listSemesters() {
  return prisma.semester.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      academicYear: true,
      startDate: true,
      endDate: true,
      isActive: true,
      archivedAt: true,
      _count: { select: { students: true } },
    },
  });
}

export async function createSemester(
  input: unknown,
  actingUserId: string
): Promise<{ id: string }> {
  const data = createSemesterSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const created = await tx.semester.create({ data, select: { id: true } });
    await logEvent(
      {
        userId: actingUserId,
        action: "SEMESTER_CREATED",
        entityType: "Semester",
        entityId: created.id,
        detail: { name: data.name, academicYear: data.academicYear },
      },
      tx
    );
    return created;
  });
}

async function getSemesterOrThrow(tx: Prisma.TransactionClient, id: string) {
  const semester = await tx.semester.findUnique({
    where: { id },
    select: { id: true, archivedAt: true },
  });
  if (!semester) throw new SemesterStateError("Semester not found");
  return semester;
}

// Serializes concurrent activate/archive calls: Postgres READ COMMITTED alone
// can't stop two transactions both ending up with an active semester. The
// second caller blocks here until the first commits, then sees its result.
function lockSemesters(tx: Prisma.TransactionClient) {
  return tx.$queryRaw`SELECT id FROM semesters FOR UPDATE`;
}

// Single transaction: lock, deactivate every semester, then activate the chosen
// one, so exactly one semester is active when it commits.
export async function activateSemester(id: string, actingUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockSemesters(tx);
    const semester = await getSemesterOrThrow(tx, id);
    if (semester.archivedAt) throw new SemesterStateError("Archived semesters can't be activated");
    await tx.semester.updateMany({ where: { isActive: true }, data: { isActive: false } });
    await tx.semester.update({ where: { id }, data: { isActive: true } });
    await logEvent(
      { userId: actingUserId, action: "SEMESTER_ACTIVATED", entityType: "Semester", entityId: id },
      tx
    );
  });
}

// Archiving only stamps archivedAt and clears isActive. Nothing is deleted:
// students, reports and documents stay attached to the semester (FR-DB-07).
export async function archiveSemester(id: string, actingUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockSemesters(tx);
    const semester = await getSemesterOrThrow(tx, id);
    if (semester.archivedAt) throw new SemesterStateError("This semester is already archived");
    await tx.semester.update({ where: { id }, data: { archivedAt: new Date(), isActive: false } });
    await logEvent(
      { userId: actingUserId, action: "SEMESTER_ARCHIVED", entityType: "Semester", entityId: id },
      tx
    );
  });
}
