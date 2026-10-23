// Workstream H (PRD Module 7): the intern writes the Final Technical Report
// once over the hour threshold; the coordinator approves or returns it.
import { FinalReportStatus, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { FinalReportLockedError, FinalReportStateError } from "@/lib/documents/errors";
import {
  calculateRenderedHours,
  getFinalReportThreshold,
} from "@/lib/services/attendance/attendanceService";
import { logEvent } from "@/lib/services/accounts/auditService";
import {
  notifyFinalReportReviewed,
  notifyFinalReportSubmitted,
} from "@/lib/services/notifications/notificationEvents";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import {
  asAttachments,
  asSections,
  ATTACHMENT_KEYS,
  finalReportDraftSchema,
  submitProblems,
  toContent,
  type Attachments,
} from "@/lib/validators/finalReport";

type ActingUser = { id: string; role: Role };

export const FINAL_REPORT_REVIEWERS: Role[] = [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];
const EDITABLE: FinalReportStatus[] = [FinalReportStatus.DRAFT, FinalReportStatus.RETURNED];
// FR-FT-01: same gate as the final cover page (credited hours vs threshold).
export async function getFinalReportState(studentProfileId: string) {
  const profile = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentProfileId },
    select: { program: true, requiredHours: true },
  });
  const [renderedHours, threshold, report] = await Promise.all([
    calculateRenderedHours(studentProfileId),
    getFinalReportThreshold(profile.program, profile.requiredHours),
    prisma.finalTechnicalReport.findUnique({ where: { studentProfileId } }),
  ]);
  return { renderedHours, threshold, unlocked: renderedHours >= threshold, report };
}

async function assertOwnerUnlocked(studentProfileId: string, actingUser: ActingUser) {
  if (actingUser.role !== Role.STUDENT_INTERN) {
    throw new ForbiddenError("Only the intern writes their final report");
  }
  await assertCanAccessStudent(actingUser, studentProfileId);
  const state = await getFinalReportState(studentProfileId);
  // The gate opens the report once; a later hour reversal mustn't strand a returned one.
  if (!state.unlocked && !state.report) {
    const remaining = Math.round((state.threshold - state.renderedHours) * 100) / 100;
    throw new FinalReportLockedError(
      `The final report unlocks at ${state.threshold} confirmed hours — ${remaining} more hours to go`
    );
  }
  return state.report;
}

export async function saveFinalReportDraft(
  studentProfileId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null
): Promise<void> {
  const existing = await assertOwnerUnlocked(studentProfileId, actingUser);
  const draft = finalReportDraftSchema.parse(input);

  const sections = { ...asSections(existing?.sections), ...(draft.sections ?? {}) };
  const attachments: Attachments = { ...asAttachments(existing?.attachments) };
  for (const [k, attached] of Object.entries(draft.attachments ?? {})) {
    if (attached !== undefined) attachments[k] = { attached, confirmed: false };
  }
  const scores = {
    ...(draft.supervisorScore !== undefined ? { supervisorScore: draft.supervisorScore } : {}),
    ...(draft.supervisorScale !== undefined ? { supervisorScale: draft.supervisorScale } : {}),
    ...(draft.peerScore !== undefined ? { peerScore: draft.peerScore } : {}),
    ...(draft.peerScale !== undefined ? { peerScale: draft.peerScale } : {}),
  };
  // A partial save must still fit the stored scale.
  const stored = existing ? toContent(existing) : null;
  finalReportDraftSchema.parse({
    supervisorScore: stored?.supervisorScore,
    supervisorScale: stored?.supervisorScale,
    peerScore: stored?.peerScore,
    peerScale: stored?.peerScale,
    ...scores,
  });

  await prisma.$transaction(async (tx) => {
    let reportId: string;
    if (!existing) {
      const created = await tx.finalTechnicalReport
        .create({
          data: {
            studentProfileId,
            sections,
            attachments: attachments as Prisma.InputJsonValue,
            ...scores,
          },
          select: { id: true },
        })
        .catch(duplicateFirstSave);
      reportId = created.id;
    } else {
      const { count } = await tx.finalTechnicalReport.updateMany({
        where: { id: existing.id, status: { in: EDITABLE } },
        data: { sections, attachments: attachments as Prisma.InputJsonValue, ...scores },
      });
      if (count === 0) {
        throw new FinalReportStateError("A submitted or approved report can't be edited");
      }
      reportId = existing.id;
    }
    await logEvent(
      {
        userId: actingUser.id,
        action: "FINAL_REPORT_SAVED",
        entityType: "FinalTechnicalReport",
        entityId: reportId,
        ipAddress: ip,
      },
      tx
    );
  });
}

// Two first saves racing on the unique student_profile_id → 409, not 500.
function duplicateFirstSave(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new FinalReportStateError("Your report was just saved elsewhere — reload and try again");
  }
  throw error;
}

export async function submitFinalReport(
  studentProfileId: string,
  actingUser: ActingUser,
  ip?: string | null
): Promise<void> {
  const report = await assertOwnerUnlocked(studentProfileId, actingUser);
  if (!report) throw new FinalReportLockedError("Write and save the report first");
  const problems = submitProblems(toContent(report));
  if (problems.length > 0) throw new FinalReportLockedError(problems.join(". "));
  // FR-FT-03: each review round confirms afresh.
  const unconfirmed = Object.fromEntries(
    Object.entries(asAttachments(report.attachments)).map(([k, v]) => [
      k,
      { attached: Boolean(v?.attached), confirmed: false },
    ])
  );

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.finalTechnicalReport.updateMany({
      where: { id: report.id, status: { in: EDITABLE } },
      data: {
        status: FinalReportStatus.SUBMITTED,
        submittedAt: new Date(),
        reviewNote: null,
        attachments: unconfirmed as Prisma.InputJsonValue,
      },
    });
    if (count === 0) throw new FinalReportStateError("This report was already submitted");
    await logEvent(
      {
        userId: actingUser.id,
        action: "FINAL_REPORT_SUBMITTED",
        entityType: "FinalTechnicalReport",
        entityId: report.id,
        ipAddress: ip,
      },
      tx
    );
  });
  await notifyFinalReportSubmitted(studentProfileId);
}

const reviewSchema = z
  .object({
    action: z.enum(["APPROVE", "RETURN"]),
    note: z.string().trim().max(1000).optional(),
    confirmed: z.array(z.enum(ATTACHMENT_KEYS)).default([]),
  })
  .refine((r) => r.action !== "RETURN" || Boolean(r.note), {
    message: "Add a note telling the intern what to fix",
    path: ["note"],
  });

// FR-FT-03: the coordinator checks each attachment in Google Classroom
// (confirmed), then approves, or returns with a note.
export async function reviewFinalReport(
  reportId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null
): Promise<void> {
  if (!FINAL_REPORT_REVIEWERS.includes(actingUser.role)) throw new ForbiddenError();
  const review = reviewSchema.parse(input);
  const report = await prisma.finalTechnicalReport.findUniqueOrThrow({ where: { id: reportId } });

  const attachments: Attachments = { ...asAttachments(report.attachments) };
  for (const k of review.confirmed) {
    if (attachments[k]?.attached) attachments[k] = { attached: true, confirmed: true };
  }
  if (review.action === "APPROVE" && ATTACHMENT_KEYS.some((k) => !attachments[k]?.confirmed)) {
    throw new FinalReportLockedError(
      "Confirm every attachment in Google Classroom before approving"
    );
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.finalTechnicalReport.updateMany({
      where: { id: reportId, status: FinalReportStatus.SUBMITTED },
      data: {
        status:
          review.action === "APPROVE" ? FinalReportStatus.APPROVED : FinalReportStatus.RETURNED,
        reviewNote: review.action === "RETURN" ? review.note : null,
        reviewedAt: new Date(),
        reviewedById: actingUser.id,
        attachments: attachments as Prisma.InputJsonValue,
      },
    });
    if (count === 0) throw new FinalReportStateError("Only a submitted report can be reviewed");
    await logEvent(
      {
        userId: actingUser.id,
        action: review.action === "APPROVE" ? "FINAL_REPORT_APPROVED" : "FINAL_REPORT_RETURNED",
        entityType: "FinalTechnicalReport",
        entityId: reportId,
        ipAddress: ip,
        ...(review.note ? { detail: { note: review.note } } : {}),
      },
      tx
    );
  });
  await notifyFinalReportReviewed(
    report.studentProfileId,
    review.action,
    review.action === "RETURN" ? review.note : undefined
  );
}

export async function listFinalReportsAwaitingReview() {
  return prisma.finalTechnicalReport.findMany({
    where: { status: FinalReportStatus.SUBMITTED, studentProfile: { deletedAt: null } },
    orderBy: { submittedAt: "asc" },
    select: {
      id: true,
      studentProfileId: true,
      submittedAt: true,
      studentProfile: {
        select: {
          studentNumber: true,
          fullName: true,
          program: true,
          user: { select: { email: true } },
        },
      },
    },
  });
}
