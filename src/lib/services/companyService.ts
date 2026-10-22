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
export const ALLOWED_MOA_TRANSITIONS: Record<MoaStatus, MoaStatus[]> = {
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

export class CompanyStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyStateError";
  }
}

// Words that don't tell two companies apart: "Accenture Inc." = "ACCENTURE PH".
const NAME_NOISE = new Set([
  "the",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llc",
  "opc",
  "ph",
  "phil",
  "phils",
  "philippines",
]);

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && !NAME_NOISE.has(word))
    .join(" ");
}

const isSimilar = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));

// FR-MOA-02: offered while an intern types, so they join the existing company instead of adding a copy.
// shortcut: scans every company in memory, fine for a department's few hundred; move to pg_trgm if it grows.
export async function findSimilarCompanies(name: string) {
  const target = normalizeCompanyName(name);
  if (target.length < 3) return [];
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, address: true },
  });
  return companies.filter((c) => isSimilar(target, normalizeCompanyName(c.name))).slice(0, 5);
}

// A student links their own profile to a company someone else already registered.
export async function joinCompany(
  companyId: string,
  positionTitle: string | undefined,
  studentUserId: string,
  ipAddress?: string | null
): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { deletedAt: true },
  });
  if (!company || company.deletedAt) throw new CompanyStateError("That company no longer exists");
  await prisma.$transaction(async (tx) => {
    const profile = await tx.studentProfile.update({
      where: { userId: studentUserId },
      data: { companyId, positionTitle },
      select: { id: true },
    });
    await logEvent(
      {
        userId: studentUserId,
        action: "COMPANY_JOINED",
        entityType: "Company",
        entityId: companyId,
        ipAddress,
        detail: { studentProfileId: profile.id },
      },
      tx
    );
  });
}

// Groups of two or more companies whose names normalize the same, for the coordinator to merge.
export async function listDuplicateCompanyGroups() {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      isVerified: true,
      _count: { select: { students: true, moaRecords: true } },
    },
  });
  const groups = new Map<string, typeof companies>();
  for (const c of companies) {
    const key = normalizeCompanyName(c.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

// Moves every intern and MOA onto `keepId`, then soft-deletes the others. Nothing is destroyed.
export async function mergeCompanies(
  keepId: string,
  mergeIds: string[],
  actingUserId: string,
  ipAddress?: string | null
): Promise<void> {
  const ids = [...new Set(mergeIds)].filter((id) => id !== keepId);
  if (ids.length === 0) throw new CompanyStateError("Choose at least one other company to merge");
  await prisma.$transaction(async (tx) => {
    const found = await tx.company.findMany({
      where: { id: { in: [keepId, ...ids] }, deletedAt: null },
      select: { id: true, name: true },
    });
    if (found.length !== ids.length + 1) {
      throw new CompanyStateError("One of those companies no longer exists");
    }
    await tx.studentProfile.updateMany({
      where: { companyId: { in: ids } },
      data: { companyId: keepId },
    });
    await tx.moaRecord.updateMany({
      where: { companyId: { in: ids } },
      data: { companyId: keepId },
    });
    await tx.company.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
    await logEvent(
      {
        userId: actingUserId,
        action: "COMPANY_MERGED",
        entityType: "Company",
        entityId: keepId,
        ipAddress,
        detail: { merged: found.filter((c) => c.id !== keepId).map((c) => c.name) },
      },
      tx
    );
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
  // Optional: when the caller is uploading a file (not a link), it needs the
  // record's id *before* the record exists, to build the Storage object path
  // ({companyId}/{moaRecordId}.{ext}) ahead of the create call. Prisma's
  // @default(uuid()) only applies when id is omitted, so passing one through
  // here lets the route generate it once and use it for both.
  id?: string;
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
        id: input.id,
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
  const now = new Date();
  return client.moaRecord.findMany({
    where: {
      // EXPIRING is the status a coordinator sets on purpose, so it must keep alerting;
      // an end date already past stops the daily alert (the checklist gate then blocks it).
      status: { in: [MoaStatus.APPROVED_ACTIVE, MoaStatus.EXPIRING] },
      validTo: { gte: now, lte: new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000) },
    },
    orderBy: { validTo: "asc" },
  });
}
