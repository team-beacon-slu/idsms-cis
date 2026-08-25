// Work plan submission and approval. See PRD Module 4 (FR-WP-*), especially
// FR-WP-05 (draft endorsement-letter queuing) and FR-WP-06 (approved = locked).
import {
  DocumentStatus,
  DocumentType,
  Prisma,
  Role,
  WorkPlan,
  WorkPlanStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";

export class WorkPlanPendingError extends Error {
  constructor(message = "A submitted work plan is already awaiting review") {
    super(message);
    this.name = "WorkPlanPendingError";
  }
}

export interface SubmitWorkPlanInput {
  plannedTasks: Prisma.InputJsonValue;
  scheduleConfig?: Prisma.InputJsonValue;
}

// Student self-only. FR-WP-06: a new submission is only allowed once the
// latest row is APPROVED or RETURNED — never while one is still SUBMITTED,
// which would let a student stack up duplicate pending submissions.
export async function submitWorkPlan(
  studentProfileId: string,
  input: SubmitWorkPlanInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<WorkPlan> {
  await assertCanAccessStudent(actingUser, studentProfileId);

  return prisma.$transaction(async (tx) => {
    const latest = await tx.workPlan.findFirst({
      where: { studentProfileId },
      orderBy: { createdAt: "desc" },
    });

    if (latest?.status === WorkPlanStatus.SUBMITTED) {
      throw new WorkPlanPendingError();
    }

    const workPlan = await tx.workPlan.create({
      data: {
        studentProfileId,
        plannedTasks: input.plannedTasks,
        scheduleConfig: input.scheduleConfig,
      },
    });

    await logEvent(
      {
        userId: actingUser.id,
        action: "WORK_PLAN_SUBMITTED",
        entityType: "WorkPlan",
        entityId: workPlan.id,
        ipAddress,
      },
      tx
    );

    return workPlan;
  });
}

// FR-WP-02: review is Department Coordinator/Admin only — not Faculty, a
// narrower role set than checklist review gets.
export async function reviewWorkPlan(
  workPlanId: string,
  action: "APPROVE" | "RETURN",
  comments: string | undefined,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<WorkPlan> {
  if (actingUser.role !== Role.DEPARTMENT_COORDINATOR && actingUser.role !== Role.SUPER_ADMIN) {
    throw new ForbiddenError("Only a Department Coordinator can review work plans");
  }

  const workPlan = await prisma.workPlan.findUniqueOrThrow({ where: { id: workPlanId } });
  await assertCanAccessStudent(actingUser, workPlan.studentProfileId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workPlan.update({
      where: { id: workPlanId },
      data: {
        status: action === "APPROVE" ? WorkPlanStatus.APPROVED : WorkPlanStatus.RETURNED,
        coordinatorId: actingUser.id,
        approvalMetadata: { reviewedAt: new Date().toISOString(), comments: comments ?? null },
      },
    });

    if (action === "APPROVE") {
      // FR-WP-05: queue a draft endorsement letter, idempotently — a student
      // can accumulate multiple WorkPlan rows over time (resubmissions) but
      // should only ever get one queued letter.
      const existingLetter = await tx.generatedDocument.findFirst({
        where: {
          studentProfileId: workPlan.studentProfileId,
          documentType: DocumentType.ENDORSEMENT_LETTER,
        },
      });
      if (!existingLetter) {
        await tx.generatedDocument.create({
          data: {
            studentProfileId: workPlan.studentProfileId,
            documentType: DocumentType.ENDORSEMENT_LETTER,
            status: DocumentStatus.PENDING_DRAFT,
          },
        });
      }
    }

    await logEvent(
      {
        userId: actingUser.id,
        action: action === "APPROVE" ? "WORK_PLAN_APPROVED" : "WORK_PLAN_RETURNED",
        entityType: "WorkPlan",
        entityId: workPlanId,
        ipAddress,
      },
      tx
    );

    return updated;
  });
}

export async function getLatestWorkPlanForStudent(
  studentProfileId: string
): Promise<WorkPlan | null> {
  return prisma.workPlan.findFirst({ where: { studentProfileId }, orderBy: { createdAt: "desc" } });
}

// Read primitive Phase 3's hour computation will need (FR-WP-04: approved
// work plans establish the fixed schedule / required hours / completion date).
export async function getLatestApprovedWorkPlanForStudent(
  studentProfileId: string
): Promise<WorkPlan | null> {
  return prisma.workPlan.findFirst({
    where: { studentProfileId, status: WorkPlanStatus.APPROVED },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWorkPlanHistory(studentProfileId: string): Promise<WorkPlan[]> {
  return prisma.workPlan.findMany({ where: { studentProfileId }, orderBy: { createdAt: "desc" } });
}
