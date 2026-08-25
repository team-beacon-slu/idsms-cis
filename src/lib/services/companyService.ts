// Company profile + MOA lifecycle management. See PRD Module 2 (FR-MOA-*).
import { Company, MoaRecord, MoaStatus, Prisma, PrismaClient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { assertCanAccessStudent } from "@/lib/services/userService";

export class InvalidMoaTransitionError extends Error {
  constructor(from: MoaStatus, to: MoaStatus) {
    super(`Cannot transition MOA from ${from} to ${to}`);
    this.name = "InvalidMoaTransitionError";
  }
}

// FR-MOA-04's lifecycle, expressed as an explicit allow-list rather than a
// free-form status field — makes "lifecycle stages must be tracked" mean
// something enforceable, not just a label.
const ALLOWED_MOA_TRANSITIONS: Record<MoaStatus, MoaStatus[]> = {
  [MoaStatus.DRAFTING]: [MoaStatus.PENDING],
  [MoaStatus.PENDING]: [MoaStatus.FOR_HTE_REVIEW],
  [MoaStatus.FOR_HTE_REVIEW]: [MoaStatus.FOR_UNIVERSITY_REVIEW],
  [MoaStatus.FOR_UNIVERSITY_REVIEW]: [MoaStatus.APPROVED_ACTIVE],
  [MoaStatus.APPROVED_ACTIVE]: [MoaStatus.EXPIRING, MoaStatus.ARCHIVED],
  [MoaStatus.EXPIRING]: [MoaStatus.EXPIRED, MoaStatus.APPROVED_ACTIVE, MoaStatus.ARCHIVED],
  [MoaStatus.EXPIRED]: [MoaStatus.ARCHIVED],
  [MoaStatus.ARCHIVED]: [],
};

export interface CreateCompanyInput {
  name: string;
  address: string;
  workModality: Company["workModality"];
  supervisorName: string;
  supervisorContact: string;
  positionTitle?: string;
  linkToStudentProfileId?: string;
}

// FR-MOA-01. `linkToStudentProfileId` defaults to the caller's own profile
// when the caller is a student; staff callers must pass it explicitly and it
// goes through assertCanAccessStudent like every other student-record touch.
export async function createCompany(
  input: CreateCompanyInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<Company> {
  return prisma.$transaction(async (tx) => {
    let targetStudentProfileId = input.linkToStudentProfileId;

    if (actingUser.role === Role.STUDENT_INTERN) {
      const ownProfile = await tx.studentProfile.findUnique({
        where: { userId: actingUser.id },
        select: { id: true },
      });
      targetStudentProfileId = ownProfile?.id;
    } else if (targetStudentProfileId) {
      await assertCanAccessStudent(actingUser, targetStudentProfileId);
    }

    const company = await tx.company.create({
      data: {
        name: input.name,
        address: input.address,
        workModality: input.workModality,
        supervisorName: input.supervisorName,
        supervisorContact: input.supervisorContact,
      },
    });

    if (targetStudentProfileId) {
      await tx.studentProfile.update({
        where: { id: targetStudentProfileId },
        data: { companyId: company.id, positionTitle: input.positionTitle },
      });
    }

    await logEvent(
      {
        userId: actingUser.id,
        action: "COMPANY_CREATED",
        entityType: "Company",
        entityId: company.id,
        ipAddress,
        detail: { name: input.name, linkedStudentProfileId: targetStudentProfileId ?? null },
      },
      tx
    );

    return company;
  });
}

export interface UpdateCompanyInput {
  name?: string;
  address?: string;
  workModality?: Company["workModality"];
  supervisorName?: string;
  supervisorContact?: string;
}

// FR-MOA-06: edit/verify is staff-only — enforced by the route's requireRole,
// this function trusts that gate the same way userService.setUserActive does.
export async function updateCompany(
  companyId: string,
  input: UpdateCompanyInput,
  actingUserId: string,
  ipAddress?: string | null
): Promise<Company> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.update({ where: { id: companyId }, data: input });
    await logEvent(
      {
        userId: actingUserId,
        action: "COMPANY_UPDATED",
        entityType: "Company",
        entityId: companyId,
        ipAddress,
      },
      tx
    );
    return company;
  });
}

export async function setCompanyVerified(
  companyId: string,
  isVerified: boolean,
  actingUserId: string,
  ipAddress?: string | null
): Promise<Company> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.update({ where: { id: companyId }, data: { isVerified } });
    await logEvent(
      {
        userId: actingUserId,
        action: isVerified ? "COMPANY_VERIFIED" : "COMPANY_UNVERIFIED",
        entityType: "Company",
        entityId: companyId,
        ipAddress,
      },
      tx
    );
    return company;
  });
}

export async function listCompanies(filters: { search?: string } = {}): Promise<Company[]> {
  const where: Prisma.CompanyWhereInput = {
    deletedAt: null,
    ...(filters.search ? { name: { contains: filters.search, mode: "insensitive" } } : {}),
  };
  return prisma.company.findMany({ where, orderBy: { name: "asc" } });
}

export async function getCompany(companyId: string): Promise<Company | null> {
  return prisma.company.findUnique({ where: { id: companyId } });
}

export interface CreateMoaRecordInput {
  companyId: string;
  documentUrl?: string;
  documentPath?: string;
  validFrom: Date;
  validTo: Date;
  programsCovered: MoaRecord["programsCovered"];
}

// FR-MOA-07: MOA create/view/edit is Faculty/Coordinator/Admin only, never
// students — enforced by the route's requireRole, same trust boundary as
// updateCompany above.
export async function createMoaRecord(
  input: CreateMoaRecordInput,
  actingUserId: string,
  ipAddress?: string | null
): Promise<MoaRecord> {
  return prisma.$transaction(async (tx) => {
    const moaRecord = await tx.moaRecord.create({
      data: {
        companyId: input.companyId,
        documentUrl: input.documentUrl,
        documentPath: input.documentPath,
        validFrom: input.validFrom,
        validTo: input.validTo,
        programsCovered: input.programsCovered,
      },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "MOA_CREATED",
        entityType: "MoaRecord",
        entityId: moaRecord.id,
        ipAddress,
        detail: { companyId: input.companyId },
      },
      tx
    );
    return moaRecord;
  });
}

export async function updateMoaRecordStatus(
  moaId: string,
  newStatus: MoaStatus,
  actingUserId: string,
  ipAddress?: string | null
): Promise<MoaRecord> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.moaRecord.findUniqueOrThrow({ where: { id: moaId } });

    if (!ALLOWED_MOA_TRANSITIONS[current.status].includes(newStatus)) {
      throw new InvalidMoaTransitionError(current.status, newStatus);
    }

    const updated = await tx.moaRecord.update({
      where: { id: moaId },
      data: { status: newStatus },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "MOA_STATUS_CHANGED",
        entityType: "MoaRecord",
        entityId: moaId,
        ipAddress,
        detail: { from: current.status, to: newStatus },
      },
      tx
    );
    return updated;
  });
}

export async function listMoaRecordsForCompany(companyId: string): Promise<MoaRecord[]> {
  return prisma.moaRecord.findMany({ where: { companyId }, orderBy: { validTo: "desc" } });
}

// Read primitive for a future Phase 4 cron job (FR-MOA-05's expiry alerts).
export async function getExpiringMoaRecords(
  daysAhead = 30,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<MoaRecord[]> {
  return client.moaRecord.findMany({
    where: {
      status: MoaStatus.APPROVED_ACTIVE,
      validTo: { lte: new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000) },
    },
    orderBy: { validTo: "asc" },
  });
}
