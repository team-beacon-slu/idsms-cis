// Go-live item 5: an intern disputes a deduction that still counts (an
// automatic item or a conduct record). Staff accept by excusing the item or
// revoking the record (acceptOpenDisputes closes the dispute), or decline it
// here with a note. Never deleted.
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import {
  assertStaffFor,
  ConductStateError,
  listAutomaticItems,
} from "@/lib/services/conduct/deductionService";
import {
  notifyDeductionDisputed,
  notifyDisputeResolved,
} from "@/lib/services/notifications/notificationEvents";
import { sameItemFamily } from "@/lib/utils/automaticDeductions";

type ActingUser = { id: string; role: Role };

const disputeSchema = z.object({
  itemType: z.enum(["LATE_WWR", "MISSING_WWR", "UNSUPPORTED_UT", "CONDUCT"]),
  itemKey: z.string().min(1).max(64),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
});

export const declineNoteSchema = z
  .string()
  .trim()
  .min(10, "Tell the intern why, in at least 10 characters")
  .max(500);

// The item as the intern sees it, or null when it no longer counts against them.
async function describeCountingItem(
  studentProfileId: string,
  itemType: string,
  itemKey: string,
  now: Date
): Promise<string | null> {
  if (itemType === "CONDUCT") {
    const record = await prisma.conductRecord.findFirst({
      where: { id: itemKey, studentProfileId, revokedAt: null },
      select: { reason: true },
    });
    return record ? `Conduct record: ${record.reason}` : null;
  }
  const items = await listAutomaticItems(studentProfileId, now);
  const item = items.find(
    (i) => sameItemFamily(i.itemType, itemType) && i.itemKey === itemKey && !i.excused
  );
  return item?.detail ?? null;
}

export async function disputeDeduction(
  studentProfileId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null,
  now: Date = new Date()
): Promise<{ id: string }> {
  // Only the intern disputes; staff have Excuse / Revoke.
  if (actingUser.role !== Role.STUDENT_INTERN) throw new ForbiddenError();
  await assertCanAccessStudent(actingUser, studentProfileId);
  const data = disputeSchema.parse(input);
  const detail = await describeCountingItem(studentProfileId, data.itemType, data.itemKey, now);
  if (!detail) throw new ConductStateError("That deduction isn't counting against you");

  try {
    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.deductionDispute.create({
        data: { studentProfileId, ...data },
        select: { id: true },
      });
      await logEvent(
        {
          userId: actingUser.id,
          action: "DEDUCTION_DISPUTED",
          entityType: "DeductionDispute",
          entityId: created.id,
          ipAddress: ip,
          detail: { studentProfileId, itemType: data.itemType, itemKey: data.itemKey },
        },
        tx
      );
      return created;
    });
    await notifyDeductionDisputed(studentProfileId, detail);
    return created;
  } catch (error) {
    // The partial unique index allows one open dispute per item.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConductStateError("You already disputed this item; your adviser will reply");
    }
    throw error;
  }
}

export async function declineDispute(
  id: string,
  note: unknown,
  actingUser: ActingUser,
  ip?: string | null
): Promise<void> {
  const resolutionNote = declineNoteSchema.parse(note);
  const dispute = await prisma.deductionDispute.findUniqueOrThrow({
    where: { id },
    select: { studentProfileId: true, itemType: true, itemKey: true },
  });
  await assertStaffFor(actingUser, dispute.studentProfileId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.deductionDispute.updateMany({
      where: { id, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        resolvedById: actingUser.id,
        outcome: "DECLINED",
        resolutionNote,
      },
    });
    if (count === 0) throw new ConductStateError("This dispute was already answered");
    await logEvent(
      {
        userId: actingUser.id,
        action: "DEDUCTION_DISPUTE_DECLINED",
        entityType: "DeductionDispute",
        entityId: id,
        ipAddress: ip,
        detail: { note: resolutionNote },
      },
      tx
    );
  });
  const detail =
    dispute.itemType === "CONDUCT"
      ? "A conduct record"
      : dispute.itemType === "UNSUPPORTED_UT"
        ? `Undertime or absence on ${dispute.itemKey}`
        : `Weekly report for the week of ${dispute.itemKey}`;
  await notifyDisputeResolved(dispute.studentProfileId, detail, "DECLINED", resolutionNote);
}

export async function listDisputes(studentProfileId: string) {
  return prisma.deductionDispute.findMany({
    where: { studentProfileId },
    orderBy: { createdAt: "desc" },
  });
}
