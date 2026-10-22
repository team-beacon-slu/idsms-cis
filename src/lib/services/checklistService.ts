// Pre-deployment checklist tracking and endorsement-letter gating. See PRD Module 3
// (FR-CK-*), FR-CK-04 (the gate) and the Checklist & MOA settings decisions.
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
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";

export class ChecklistGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChecklistGateError";
  }
}

// ---- Which items apply to an intern, and which of those gate the endorsement letter ----

// The original nine stay required unless the Super Admin changes the list.
export const DEFAULT_REQUIRED_CHECKLIST: ChecklistRequirementType[] = [
  ChecklistRequirementType.MEDICAL_CERTIFICATE,
  ChecklistRequirementType.PSYCHOLOGICAL_CLEARANCE,
  ChecklistRequirementType.PARENT_CONSENT_UNDERTAKING,
  ChecklistRequirementType.COMPANY_REPLY_FORM,
  ChecklistRequirementType.DATA_PRIVACY_ORIENTATION,
  ChecklistRequirementType.INTERNSHIP_ORIENTATION,
  ChecklistRequirementType.GOVERNMENT_COMPANY_PERMIT,
  ChecklistRequirementType.WORK_PLAN,
  ChecklistRequirementType.MOA,
];
const REQUIRED_CONFIG_KEY = "checklist.requiredItems";
const requiredListSchema = z.array(z.enum(ChecklistRequirementType)).max(20);

export async function getRequiredChecklistTypes(
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<ChecklistRequirementType[]> {
  const row = await client.systemConfig.findUnique({ where: { configKey: REQUIRED_CONFIG_KEY } });
  const parsed = requiredListSchema.safeParse(row?.configValue);
  return parsed.success ? parsed.data : DEFAULT_REQUIRED_CHECKLIST;
}

export async function setRequiredChecklistTypes(
  input: unknown,
  actingUserId: string,
  ipAddress?: string | null
): Promise<ChecklistRequirementType[]> {
  const types = [...new Set(requiredListSchema.parse(input))];
  await prisma.$transaction(async (tx) => {
    await tx.systemConfig.upsert({
      where: { configKey: REQUIRED_CONFIG_KEY },
      create: { configKey: REQUIRED_CONFIG_KEY, configValue: types, updatedBy: actingUserId },
      update: { configValue: types, updatedBy: actingUserId },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "CHECKLIST_REQUIRED_ITEMS_UPDATED",
        entityType: "SystemConfig",
        entityId: REQUIRED_CONFIG_KEY,
        ipAddress,
        detail: { required: types },
      },
      tx
    );
  });
  return types;
}

export interface ChecklistContext {
  isForeignCompany: boolean;
  classType: string | null;
  startBeforeMoaAllowed: boolean;
}

// Pure: proof of corporate legitimacy applies only to foreign-owned host companies, the
// internship agreement only to irregular students (a class group that isn't "Regular"),
// and a start-before-MOA override takes the MOA out of the gate (it stays on the list).
export function checklistRequirements(
  required: ChecklistRequirementType[],
  ctx: ChecklistContext
): { applicable: Set<ChecklistRequirementType>; gate: Set<ChecklistRequirementType> } {
  const irregular = !!ctx.classType && ctx.classType.trim().toLowerCase() !== "regular";
  const applicable = new Set(
    Object.values(ChecklistRequirementType).filter(
      (t) =>
        (t !== ChecklistRequirementType.PROOF_OF_CORPORATE_LEGITIMACY || ctx.isForeignCompany) &&
        (t !== ChecklistRequirementType.INTERNSHIP_AGREEMENT || irregular)
    )
  );
  const gate = new Set(
    required.filter(
      (t) => applicable.has(t) && !(t === ChecklistRequirementType.MOA && ctx.startBeforeMoaAllowed)
    )
  );
  return { applicable, gate };
}

const CONTEXT_SELECT = {
  startBeforeMoaAllowed: true,
  startBeforeMoaReason: true,
  company: { select: { isForeign: true } },
  classGroup: { select: { classType: true } },
} satisfies Prisma.StudentProfileSelect;

async function loadContext(
  studentProfileId: string,
  client: PrismaClient | Prisma.TransactionClient
) {
  const profile = await client.studentProfile.findUniqueOrThrow({
    where: { id: studentProfileId },
    select: CONTEXT_SELECT,
  });
  return {
    ctx: {
      isForeignCompany: profile.company?.isForeign ?? false,
      classType: profile.classGroup?.classType ?? null,
      startBeforeMoaAllowed: profile.startBeforeMoaAllowed,
    },
    startBeforeMoaReason: profile.startBeforeMoaReason,
  };
}

// FR-CK-04's gate: every required, applicable item approved. A missing row is not approved.
export async function isEndorsementGateSatisfied(
  studentProfileId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<boolean> {
  const [required, { ctx }, items] = await Promise.all([
    getRequiredChecklistTypes(client),
    loadContext(studentProfileId, client),
    client.preDeploymentChecklistItem.findMany({
      where: { studentProfileId },
      select: { requirementType: true, status: true },
    }),
  ]);
  const approved = new Set(
    items.filter((i) => i.status === ChecklistStatus.APPROVED).map((i) => i.requirementType)
  );
  const { gate } = checklistRequirements(required, ctx);
  return [...gate].every((t) => approved.has(t));
}

export interface ChecklistProgress {
  items: (PreDeploymentChecklistItem & { required: boolean })[];
  approvedCount: number;
  total: number;
  percentage: number;
  gateSatisfied: boolean;
  startBeforeMoa: { allowed: boolean; reason: string | null };
}

export async function getChecklistProgress(studentProfileId: string): Promise<ChecklistProgress> {
  const [rows, required, { ctx, startBeforeMoaReason }] = await Promise.all([
    prisma.preDeploymentChecklistItem.findMany({
      where: { studentProfileId },
      orderBy: { requirementType: "asc" },
    }),
    getRequiredChecklistTypes(),
    loadContext(studentProfileId, prisma),
  ]);
  const { applicable, gate } = checklistRequirements(required, ctx);
  // Items that don't apply to this intern (e.g. a local company's proof of legitimacy) are hidden.
  const items = rows
    .filter((r) => applicable.has(r.requirementType))
    .map((r) => ({ ...r, required: gate.has(r.requirementType) }));
  const approvedCount = items.filter(
    (i) => i.required && i.status === ChecklistStatus.APPROVED
  ).length;
  // The gate counts required items even before their rows exist, so "0/0" never shows.
  const total = gate.size;

  return {
    items,
    approvedCount,
    total,
    percentage: total > 0 ? Math.round((approvedCount / total) * 100) : 100,
    gateSatisfied: approvedCount === total,
    startBeforeMoa: { allowed: ctx.startBeforeMoaAllowed, reason: startBeforeMoaReason },
  };
}

// The adviser (or coordinator / Super Admin) lets an intern start before the MOA is
// approved; a reason is required when allowing, and every change is audited.
export async function setStartBeforeMoa(
  studentProfileId: string,
  input: unknown,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<void> {
  if (actingUser.role === Role.STUDENT_INTERN) {
    throw new ForbiddenError("Only staff can change this");
  }
  await assertCanAccessStudent(actingUser, studentProfileId);
  const { allowed, reason } = startBeforeMoaSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    await tx.studentProfile.update({
      where: { id: studentProfileId },
      data: allowed
        ? {
            startBeforeMoaAllowed: true,
            startBeforeMoaReason: reason,
            startBeforeMoaBy: actingUser.id,
            startBeforeMoaAt: new Date(),
          }
        : {
            startBeforeMoaAllowed: false,
            startBeforeMoaReason: null,
            startBeforeMoaBy: actingUser.id,
            startBeforeMoaAt: new Date(),
          },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: allowed ? "START_BEFORE_MOA_ALLOWED" : "START_BEFORE_MOA_REVOKED",
        entityType: "StudentProfile",
        entityId: studentProfileId,
        ipAddress,
        detail: allowed ? { reason } : null,
      },
      tx
    );
  });
}

const startBeforeMoaSchema = z.discriminatedUnion("allowed", [
  z.object({
    allowed: z.literal(true),
    reason: z.string().trim().min(5, "Give the reason (at least a few words)").max(500),
  }),
  z.object({ allowed: z.literal(false), reason: z.string().optional() }),
]);

// Status tracking only (D7): documents are submitted in Google Classroom, so
// review never requires a stored file.
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
        // Still valid: active or marked expiring, and not past its end date.
        status: { in: [MoaStatus.APPROVED_ACTIVE, MoaStatus.EXPIRING] },
        validTo: { gte: new Date() },
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
