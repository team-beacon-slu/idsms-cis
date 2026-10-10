// Pre-deployment 9-item checklist tracking and endorsement-letter gating.
// See PRD Module 3 (FR-CK-*), especially FR-CK-04 (9/9 gate).
import {
  ChecklistRequirementType,
  ChecklistStatus,
  MoaStatus,
  PreDeploymentChecklistItem,
  Prisma,
  PrismaClient,
  Role,
  WorkPlanStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { CHECKLIST_BUCKET, uploadFile } from "@/lib/storage";

export class ChecklistGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChecklistGateError";
  }
}

export class ChecklistLockedError extends Error {
  constructor(message = "This checklist item is already approved and locked") {
    super(message);
    this.name = "ChecklistLockedError";
  }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// FR-CK-04's gate, factored out as its own primitive so Phase 4's real
// endorsement-letter generation can call this exact check rather than
// re-deriving "9/9 approved" itself.
export async function isEndorsementGateSatisfied(
  studentProfileId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<boolean> {
  const items = await client.preDeploymentChecklistItem.findMany({
    where: { studentProfileId },
    select: { status: true },
  });
  return items.length === 9 && items.every((item) => item.status === ChecklistStatus.APPROVED);
}

export interface ChecklistProgress {
  items: PreDeploymentChecklistItem[];
  approvedCount: number;
  total: number;
  percentage: number;
  gateSatisfied: boolean;
}

export async function getChecklistProgress(studentProfileId: string): Promise<ChecklistProgress> {
  const items = await prisma.preDeploymentChecklistItem.findMany({
    where: { studentProfileId },
    orderBy: { requirementType: "asc" },
  });
  const approvedCount = items.filter((item) => item.status === ChecklistStatus.APPROVED).length;

  return {
    items,
    approvedCount,
    total: items.length,
    percentage: items.length > 0 ? Math.round((approvedCount / items.length) * 100) : 0,
    gateSatisfied: items.length === 9 && approvedCount === 9,
  };
}

// Student self-only (checked via assertCanAccessStudent's STUDENT_INTERN
// branch). Blocks re-upload once the item is already APPROVED — an approved
// document shouldn't be silently swappable without re-review, mirroring the
// spirit of FR-WP-06's "approved = locked" even though the PRD doesn't say
// this explicitly for checklist items.
export async function uploadChecklistItemFile(
  itemId: string,
  file: File,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<PreDeploymentChecklistItem> {
  const item = await prisma.preDeploymentChecklistItem.findUniqueOrThrow({ where: { id: itemId } });
  await assertCanAccessStudent(actingUser, item.studentProfileId);

  if (item.status === ChecklistStatus.APPROVED) {
    throw new ChecklistLockedError();
  }

  const extension = EXTENSION_BY_MIME[file.type] ?? "bin";
  const path = `${item.studentProfileId}/${item.requirementType}.${extension}`;
  await uploadFile(CHECKLIST_BUCKET, path, file);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.preDeploymentChecklistItem.update({
      where: { id: itemId },
      // Re-upload always resets to PENDING — a Return-then-reupload cycle
      // should land back in the review queue, not stay RETURNED silently.
      data: { filePath: path, status: ChecklistStatus.PENDING },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: "CHECKLIST_ITEM_UPLOADED",
        entityType: "PreDeploymentChecklistItem",
        entityId: itemId,
        ipAddress,
        detail: { requirementType: item.requirementType },
      },
      tx
    );
    return updated;
  });
}

// Staff-only (Faculty/Coordinator/Admin — enforced by the route's
// requireRole; assertCanAccessStudent below is the record-ownership half).
// APPROVE on items 8 (WORK_PLAN) / 9 (MOA) is gated on the underlying
// WorkPlan/MoaRecord actually being approved — RETURN is never gated, Faculty
// can always flag a problem. This is what makes FR-CK-04's gate strict rather
// than a rubber stamp.
export async function reviewChecklistItem(
  itemId: string,
  action: "APPROVE" | "RETURN",
  comments: string | undefined,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<PreDeploymentChecklistItem> {
  if (actingUser.role === Role.STUDENT_INTERN) {
    throw new ForbiddenError("Students cannot review checklist items");
  }

  const item = await prisma.preDeploymentChecklistItem.findUniqueOrThrow({ where: { id: itemId } });
  await assertCanAccessStudent(actingUser, item.studentProfileId);

  if (action === "APPROVE") {
    await assertUnderlyingRecordApproved(item);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.preDeploymentChecklistItem.update({
      where: { id: itemId },
      data: {
        status: action === "APPROVE" ? ChecklistStatus.APPROVED : ChecklistStatus.RETURNED,
        reviewerId: actingUser.id,
        reviewDate: new Date(),
        comments: comments ?? null,
      },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: action === "APPROVE" ? "CHECKLIST_ITEM_APPROVED" : "CHECKLIST_ITEM_RETURNED",
        entityType: "PreDeploymentChecklistItem",
        entityId: itemId,
        ipAddress,
        detail: { requirementType: item.requirementType },
      },
      tx
    );
    return updated;
  });
}

async function assertUnderlyingRecordApproved(item: PreDeploymentChecklistItem): Promise<void> {
  if (item.requirementType === ChecklistRequirementType.WORK_PLAN) {
    const latestWorkPlan = await prisma.workPlan.findFirst({
      where: { studentProfileId: item.studentProfileId },
      orderBy: { createdAt: "desc" },
    });
    if (latestWorkPlan?.status !== WorkPlanStatus.APPROVED) {
      throw new ChecklistGateError("The student's work plan is not yet approved");
    }
    return;
  }

  if (item.requirementType === ChecklistRequirementType.MOA) {
    const studentProfile = await prisma.studentProfile.findUniqueOrThrow({
      where: { id: item.studentProfileId },
      select: { companyId: true, program: true },
    });

    if (!studentProfile.companyId) {
      throw new ChecklistGateError("The student has no company on file");
    }

    const activeMoa = await prisma.moaRecord.findFirst({
      where: {
        companyId: studentProfile.companyId,
        status: MoaStatus.APPROVED_ACTIVE,
        programsCovered: { has: studentProfile.program },
      },
    });
    if (!activeMoa) {
      throw new ChecklistGateError(
        "The student's company has no active MOA covering their program"
      );
    }
  }
}
