// An intern's placements at host companies (025): opened on joining, ended by a
// notification of retraction that SAMCIS notes (SLU Internship Program guidelines, IV.1.e).
// The history keeps a company's track record honest after an intern moves.
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import { z } from "zod";

type ActingUser = { id: string; role: Role };
type Tx = Prisma.TransactionClient;

export class PlacementStateError extends Error {}

// Loaded on use: companyService imports placeIntern, and the email stack must not come with it.
const notify: typeof import("@/lib/services/notifications/notify").notify = async (input) =>
  (await import("@/lib/services/notifications/notify")).notify(input);

// Who may note a retraction for SAMCIS.
export const RETRACTION_NOTERS: Role[] = [
  Role.FACULTY_ADVISER,
  Role.DEPARTMENT_COORDINATOR,
  Role.SUPER_ADMIN,
];

const today = () => new Date(new Date().toISOString().slice(0, 10));

// Joining a company: one open placement per intern. Another company's open placement must be
// ended by a noted retraction first, so a move is always on record.
export async function placeIntern(
  tx: Tx,
  studentProfileId: string,
  companyId: string,
  positionTitle: string | undefined
) {
  const open = await tx.companyPlacement.findFirst({
    where: { studentProfileId, endedOn: null },
    select: { id: true, companyId: true },
  });
  if (open && open.companyId !== companyId) {
    throw new PlacementStateError(
      "You are still placed at another company. File a notification of retraction there first; once SAMCIS notes it, you can join a new company."
    );
  }
  if (open) {
    await tx.companyPlacement.update({ where: { id: open.id }, data: { positionTitle } });
  } else {
    await tx.companyPlacement.create({
      data: { studentProfileId, companyId, positionTitle, startedOn: today() },
    });
  }
  await tx.studentProfile.update({
    where: { id: studentProfileId },
    data: { companyId, positionTitle },
  });
}

export const retractionSchema = z.object({
  lastDay: z.iso.date().transform((d) => new Date(`${d}T00:00:00.000Z`)),
  reason: z.string().trim().min(10, "Say why you are stopping (at least 10 characters)").max(2000),
});

// The intern's notification of retraction for their current company.
export async function fileRetraction(
  studentProfileId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null
) {
  if (actingUser.role !== Role.STUDENT_INTERN) throw new ForbiddenError();
  await assertCanAccessStudent(actingUser, studentProfileId);
  const { lastDay, reason } = retractionSchema.parse(input);
  const open = await prisma.companyPlacement.findFirst({
    where: { studentProfileId, endedOn: null },
    select: { id: true, startedOn: true, company: { select: { name: true } } },
  });
  if (!open) throw new PlacementStateError("You have no current host company to stop at");
  if (lastDay < open.startedOn) {
    throw new PlacementStateError("Your last day can't be before you started at this company");
  }
  await prisma.$transaction(async (tx) => {
    await tx.companyPlacement.update({
      where: { id: open.id },
      data: { retractionLastDay: lastDay, retractionReason: reason, retractionFiledAt: new Date() },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: "RETRACTION_FILED",
        entityType: "CompanyPlacement",
        entityId: open.id,
        ipAddress: ip,
      },
      tx
    );
  });
  await notifyStaff(studentProfileId, open.company.name);
  return { id: open.id };
}

async function notifyStaff(studentProfileId: string, companyName: string) {
  await notifyStaffOf(
    studentProfileId,
    "RETRACTION_FILED",
    "Notification of retraction",
    `An intern filed a notification of retraction at ${companyName}. Note it to end the placement.`
  );
}

// The intern's advisers and the coordinators, told by in-app notice and email.
async function notifyStaffOf(
  studentProfileId: string,
  trigger: "RETRACTION_FILED" | "SUPERVISOR_CHANGED",
  title: string,
  body: string
) {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { classGroupId: true, semesterId: true },
  });
  if (!profile) return;
  const [advisers, coordinators] = await Promise.all([
    prisma.facultyClassGroup.findMany({
      where: { classGroupId: profile.classGroupId, semesterId: profile.semesterId },
      select: { facultyId: true },
    }),
    prisma.user.findMany({
      where: { role: Role.DEPARTMENT_COORDINATOR, isActive: true },
      select: { id: true },
    }),
  ]);
  await notify({
    userIds: [...new Set([...advisers.map((a) => a.facultyId), ...coordinators.map((c) => c.id)])],
    trigger,
    title,
    body,
    link: `/students/${studentProfileId}/checklist`,
    email: true,
  }).catch((error) => console.error("Staff notice failed:", title, error));
}

// SAMCIS notes the retraction: the placement ends on the intern's last day and the intern
// may join another company.
export async function noteRetraction(
  placementId: string,
  actingUser: ActingUser,
  ip?: string | null
) {
  if (!RETRACTION_NOTERS.includes(actingUser.role)) throw new ForbiddenError();
  const placement = await prisma.companyPlacement.findUnique({
    where: { id: placementId },
    select: {
      studentProfileId: true,
      endedOn: true,
      retractionFiledAt: true,
      retractionLastDay: true,
      studentProfile: { select: { userId: true } },
    },
  });
  if (!placement) throw new PlacementStateError("That placement no longer exists");
  await assertCanAccessStudent(actingUser, placement.studentProfileId);
  if (!placement.retractionFiledAt || placement.endedOn) {
    throw new PlacementStateError("There is no open retraction to note");
  }
  await prisma.$transaction(async (tx) => {
    await tx.companyPlacement.update({
      where: { id: placementId },
      data: {
        endedOn: placement.retractionLastDay,
        endReason: "RETRACTED",
        retractionNotedAt: new Date(),
        retractionNotedById: actingUser.id,
      },
    });
    await tx.studentProfile.update({
      where: { id: placement.studentProfileId },
      data: { companyId: null, positionTitle: null },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: "RETRACTION_NOTED",
        entityType: "CompanyPlacement",
        entityId: placementId,
        ipAddress: ip,
      },
      tx
    );
  });
  await notify({
    userIds: [placement.studentProfile.userId],
    trigger: "RETRACTION_NOTED",
    title: "Retraction noted",
    body: "SAMCIS noted your notification of retraction. You can now join your next host company.",
    link: "/companies/new",
    email: true,
  }).catch((error) => console.error("Retraction noted notice failed", error));
}

export async function listPlacementsForStudent(studentProfileId: string) {
  return prisma.companyPlacement.findMany({
    where: { studentProfileId },
    orderBy: { startedOn: "desc" },
    include: {
      company: { select: { id: true, name: true, address: true, supervisorName: true } },
      supervisors: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] },
    },
  });
}

export const supervisorChangeSchema = z.object({
  supervisorName: z.string().trim().min(2, "Enter the supervisor's full name").max(200),
  supervisorPosition: z.string().trim().max(200).optional(),
  supervisorContact: z.string().trim().min(3, "Enter an email or phone number").max(200),
  effectiveFrom: z.iso.date().transform((d) => new Date(`${d}T00:00:00.000Z`)),
});

// Panel revisions (Nov 2026): the intern's supervisor changed during the placement. Kept
// as a dated row so each week's report prints the supervisor of that week. The intern
// records it; staff who can see the intern may too. The company's own record is untouched.
export async function changeSupervisor(
  placementId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null
) {
  if (actingUser.role !== Role.STUDENT_INTERN && !RETRACTION_NOTERS.includes(actingUser.role)) {
    throw new ForbiddenError();
  }
  const data = supervisorChangeSchema.parse(input);
  const placement = await prisma.companyPlacement.findUnique({
    where: { id: placementId },
    select: { studentProfileId: true, startedOn: true, endedOn: true, company: true },
  });
  if (!placement) throw new PlacementStateError("That placement no longer exists");
  await assertCanAccessStudent(actingUser, placement.studentProfileId);
  if (placement.endedOn) {
    throw new PlacementStateError("This placement has ended; record the change at your current company");
  }
  if (data.effectiveFrom < placement.startedOn) {
    throw new PlacementStateError("The change can't be before you started at this company");
  }
  // Today in Manila (UTC+8), so an early-morning entry isn't refused as tomorrow.
  const manilaToday = new Date(new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10));
  if (data.effectiveFrom > manilaToday) {
    throw new PlacementStateError("Record the change on or after the day it happens");
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.placementSupervisor.create({
      data: {
        placementId,
        supervisorName: data.supervisorName,
        supervisorPosition: data.supervisorPosition || null,
        supervisorContact: data.supervisorContact,
        effectiveFrom: data.effectiveFrom,
        createdBy: actingUser.id,
      },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: "SUPERVISOR_CHANGED",
        entityType: "CompanyPlacement",
        entityId: placementId,
        ipAddress: ip,
        detail: { effectiveFrom: data.effectiveFrom.toISOString().slice(0, 10) },
      },
      tx
    );
    return created;
  });
  if (actingUser.role === Role.STUDENT_INTERN) {
    await notifyStaffOf(
      placement.studentProfileId,
      "SUPERVISOR_CHANGED",
      "Change of supervisor",
      `An intern at ${placement.company.name} recorded a new supervisor, ${data.supervisorName}.`
    );
  }
  return row;
}

// The host company and supervisor of an intern's report week: the placement the week falls
// in (the later one when the intern moved mid-week, since its supervisor signs the week) and
// the supervisor in charge at the end of that week or placement, else the company's own.
// Null when no placement overlaps the week (callers fall back to the current company).
export async function hostForWeek(
  studentProfileId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<{ name: string; supervisorName: string } | null> {
  const placement = await prisma.companyPlacement.findFirst({
    where: {
      studentProfileId,
      startedOn: { lte: weekEnd },
      OR: [{ endedOn: null }, { endedOn: { gte: weekStart } }],
    },
    orderBy: { startedOn: "desc" },
    select: {
      endedOn: true,
      company: { select: { name: true, supervisorName: true } },
      supervisors: {
        where: { effectiveFrom: { lte: weekEnd } },
        // Latest first; two changes on one day: the one entered last wins.
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
        select: { supervisorName: true, effectiveFrom: true },
      },
    },
  });
  if (!placement) return null;
  const until = placement.endedOn && placement.endedOn < weekEnd ? placement.endedOn : weekEnd;
  const current = placement.supervisors.find((s) => s.effectiveFrom <= until);
  return {
    name: placement.company.name,
    supervisorName: current?.supervisorName ?? placement.company.supervisorName,
  };
}

export async function listPlacementsForCompany(companyId: string) {
  return prisma.companyPlacement.findMany({
    where: { companyId },
    orderBy: { startedOn: "desc" },
    include: {
      studentProfile: {
        select: {
          id: true,
          fullName: true,
          studentNumber: true,
          semester: { select: { name: true } },
        },
      },
    },
  });
}
