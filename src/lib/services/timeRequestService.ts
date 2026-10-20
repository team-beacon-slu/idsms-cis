// Workstream L1: leave, overtime and undertime requests. Stored in the
// existing DeviationReport table: validationStatus PENDING / VALIDATED
// (Approved) / REJECTED (Returned, with the adviser's reviewNote).
import { DeviationType, Role, ValidationStatus, type DeviationReport } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { notifyTimeRequestReviewed } from "@/lib/services/notificationEvents";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { recomputeCreditedHours } from "@/lib/services/weeklyReportService";
import { toDateKey } from "@/lib/utils/reportDeadline";
import {
  requestedMinutes,
  timeRequestReviewSchema,
  timeRequestSchema,
  type TimeRequestInput,
} from "@/lib/validators/timeRequest";

type ActingUser = { id: string; role: Role };

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export class TimeRequestStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeRequestStateError";
  }
}

function requestFields(input: TimeRequestInput) {
  const isLeave = input.deviationType === "ABSENCE";
  return {
    deviationType: input.deviationType as DeviationType,
    requestKind: input.requestKind,
    date: input.date,
    endDate: isLeave ? (input.endDate ?? null) : null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    requestedMinutes: requestedMinutes(input),
    proofType: isLeave ? (input.proofType ?? null) : null,
    reason: input.reason,
  };
}

export async function createTimeRequest(
  studentProfileId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null
): Promise<{ id: string }> {
  if (actingUser.role !== Role.STUDENT_INTERN) {
    throw new ForbiddenError("Only the intern files their own requests");
  }
  await assertCanAccessStudent(actingUser, studentProfileId);
  const data = requestFields(timeRequestSchema.parse(input));
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const created = await tx.deviationReport.create({
      data: { studentProfileId, ...data, submittedAt: now, updatedAt: now },
      select: { id: true },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: "TIME_REQUEST_SUBMITTED",
        entityType: "DeviationReport",
        entityId: created.id,
        ipAddress: ip,
        detail: { deviationType: data.deviationType, date: toDateKey(data.date) },
      },
      tx
    );
    return created;
  });
}

// Owner only; Pending or Returned only. Resets to Pending for a fresh review.
export async function updateTimeRequest(
  id: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null
): Promise<void> {
  const existing = await prisma.deviationReport.findUniqueOrThrow({
    where: { id },
    select: { id: true, validationStatus: true, studentProfile: { select: { userId: true } } },
  });
  if (actingUser.role !== Role.STUDENT_INTERN || existing.studentProfile.userId !== actingUser.id) {
    throw new ForbiddenError("Only the intern who filed this request can edit it");
  }
  if (existing.validationStatus === ValidationStatus.VALIDATED) {
    throw new TimeRequestStateError("Approved requests can't be edited");
  }
  const data = requestFields(timeRequestSchema.parse(input));

  await prisma.$transaction(async (tx) => {
    await tx.deviationReport.update({
      where: { id },
      data: {
        ...data,
        validationStatus: ValidationStatus.PENDING,
        reviewNote: null,
        facultyId: null,
        updatedAt: new Date(),
      },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action:
          existing.validationStatus === ValidationStatus.REJECTED
            ? "TIME_REQUEST_RESUBMITTED"
            : "TIME_REQUEST_UPDATED",
        entityType: "DeviationReport",
        entityId: id,
        ipAddress: ip,
        detail: { deviationType: data.deviationType, date: toDateKey(data.date) },
      },
      tx
    );
  });
}

// Assigned adviser, coordinator or Super Admin. APPROVE needs a Pending
// request; RETURN works on Pending or Approved (revoking credited OT).
export async function reviewTimeRequest(
  id: string,
  action: "APPROVE" | "RETURN",
  note: string | undefined,
  actingUser: ActingUser,
  ip?: string | null
): Promise<{ studentProfileId: string; status: ValidationStatus }> {
  const review = timeRequestReviewSchema.parse({ action, note });
  if (!STAFF_ROLES.includes(actingUser.role)) throw new ForbiddenError();
  const request = await prisma.deviationReport.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      studentProfileId: true,
      deviationType: true,
      date: true,
      endDate: true,
      validationStatus: true,
    },
  });
  await assertCanAccessStudent(actingUser, request.studentProfileId);

  const allowed =
    review.action === "APPROVE"
      ? request.validationStatus === ValidationStatus.PENDING
      : request.validationStatus !== ValidationStatus.REJECTED;
  if (!allowed) {
    throw new TimeRequestStateError(
      review.action === "APPROVE"
        ? "Only a pending request can be approved"
        : "This request was already returned"
    );
  }

  const status =
    review.action === "APPROVE" ? ValidationStatus.VALIDATED : ValidationStatus.REJECTED;
  const reviewNote = review.action === "RETURN" ? (review.note ?? null) : null;
  await prisma.$transaction(async (tx) => {
    await tx.deviationReport.update({
      where: { id },
      data: { validationStatus: status, facultyId: actingUser.id, reviewNote },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: review.action === "APPROVE" ? "TIME_REQUEST_APPROVED" : "TIME_REQUEST_RETURNED",
        entityType: "DeviationReport",
        entityId: id,
        ipAddress: ip,
        detail: {
          deviationType: request.deviationType,
          ...(reviewNote ? { note: reviewNote } : {}),
        },
      },
      tx
    );
  });

  // After commit: only approved overtime changes credited hours.
  if (request.deviationType === DeviationType.OVERTIME) {
    await recomputeCreditedHours(request.studentProfileId, { dates: [request.date] });
  }
  await notifyTimeRequestReviewed(
    request.studentProfileId,
    review.action,
    request,
    reviewNote ?? undefined
  );
  return { studentProfileId: request.studentProfileId, status };
}

// Overtime must be requested before it is worked: flag OT filed on a later
// Manila day than the date it covers.
export function isFiledAfterTheFact(r: {
  deviationType: string;
  date: Date;
  submittedAt: Date | null;
}): boolean {
  if (r.deviationType !== DeviationType.OVERTIME || !r.submittedAt) return false;
  return toDateKey(new Date(r.submittedAt.getTime() + MANILA_OFFSET_MS)) > toDateKey(r.date);
}

export type TimeRequestView = DeviationReport & { filedAfterTheFact: boolean };

export async function listTimeRequests(studentProfileId: string): Promise<TimeRequestView[]> {
  const rows = await prisma.deviationReport.findMany({
    where: { studentProfileId },
    orderBy: [{ date: "desc" }, { submittedAt: "desc" }],
  });
  return rows.map((r) => ({ ...r, filedAfterTheFact: isFiledAfterTheFact(r) }));
}

export async function getTimeRequestStudentProfileId(id: string): Promise<string> {
  const r = await prisma.deviationReport.findUniqueOrThrow({
    where: { id },
    select: { studentProfileId: true },
  });
  return r.studentProfileId;
}
