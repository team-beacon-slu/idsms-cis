// Workstream L2: conduct records (warnings, demerits, violations, suspensions)
// issued by the assigned adviser, coordinator or Super Admin. Never deleted,
// only revoked with a reason.
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeTotalHoursRendered } from "@/lib/services/attendanceService";
import { logEvent } from "@/lib/services/auditService";
import { getDefaultConductHours, getDeductionMatrix } from "@/lib/services/deductionService";
import { notifyConductRecordIssued } from "@/lib/services/notificationEvents";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { conductRecordSchema, revokeReasonSchema } from "@/lib/validators/conduct";

type ActingUser = { id: string; role: Role };

export const CONDUCT_STAFF_ROLES: Role[] = [
  Role.FACULTY_ADVISER,
  Role.DEPARTMENT_COORDINATOR,
  Role.SUPER_ADMIN,
];

export class ConductStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConductStateError";
  }
}

async function assertStaffFor(actingUser: ActingUser, studentProfileId: string) {
  if (!CONDUCT_STAFF_ROLES.includes(actingUser.role)) throw new ForbiddenError();
  await assertCanAccessStudent(actingUser, studentProfileId);
}

export async function issueConductRecord(
  studentProfileId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null
): Promise<{ id: string }> {
  await assertStaffFor(actingUser, studentProfileId);
  const data = conductRecordSchema.parse(input);
  const manual = (await getDeductionMatrix()).filter((c) => c.source === "MANUAL");
  const key = z
    .string()
    .refine((k) => manual.some((c) => c.key === k), "Choose a category staff can issue")
    .parse(data.categoryKey);
  const category = manual.find((c) => c.key === key)!;
  const hoursDeducted = data.hoursDeducted ?? (await getDefaultConductHours());

  const created = await prisma.$transaction(async (tx) => {
    const record = await tx.conductRecord.create({
      data: {
        studentProfileId,
        categoryKey: data.categoryKey,
        weight: data.weight,
        date: data.date,
        reason: data.reason,
        hoursDeducted,
        issuedById: actingUser.id,
      },
      select: { id: true },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: "CONDUCT_RECORD_ISSUED",
        entityType: "ConductRecord",
        entityId: record.id,
        ipAddress: ip,
        detail: {
          studentProfileId,
          categoryKey: data.categoryKey,
          weight: data.weight,
          hoursDeducted,
        },
      },
      tx
    );
    return record;
  });

  // After commit.
  if (hoursDeducted > 0) await computeTotalHoursRendered(studentProfileId);
  await notifyConductRecordIssued(studentProfileId, category.label, data.reason);
  return created;
}

export async function revokeConductRecord(
  id: string,
  reason: string,
  actingUser: ActingUser,
  ip?: string | null
): Promise<void> {
  const revokeReason = revokeReasonSchema.parse(reason);
  const record = await prisma.conductRecord.findUniqueOrThrow({
    where: { id },
    select: { studentProfileId: true, hoursDeducted: true },
  });
  await assertStaffFor(actingUser, record.studentProfileId);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.conductRecord.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actingUser.id, revokeReason },
    });
    if (count === 0) throw new ConductStateError("This record was already revoked");
    await logEvent(
      {
        userId: actingUser.id,
        action: "CONDUCT_RECORD_REVOKED",
        entityType: "ConductRecord",
        entityId: id,
        ipAddress: ip,
        detail: { reason: revokeReason },
      },
      tx
    );
  });
  if (Number(record.hoursDeducted) > 0) await computeTotalHoursRendered(record.studentProfileId);
}

export async function listConductRecords(studentProfileId: string) {
  return prisma.conductRecord.findMany({
    where: { studentProfileId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}
