import { Prisma, RetentionSource, RetentionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { isStoragePath } from "@/lib/services/attendance/attendanceService";
import { notify } from "@/lib/services/notifications/notify";
import { getSuperAdminIds } from "@/lib/services/notifications/notificationRecipients";
import { ComplianceNotFoundError, RetentionStateError } from "@/lib/errors/compliance";
import { CHECKLIST_BUCKET, GENERATED_DOCUMENTS_BUCKET, deleteObject } from "@/lib/storage";

// NFR-DP-08 / NFR-DP-06: files more than 3 years past their semester are
// flagged for Super Admin review. The scan only flags; it never deletes.
export const RETENTION_YEARS = 3;
export const RETENTION_SCAN_INTERVAL_DAYS = 90;
export const RETENTION_LAST_SCAN_KEY = "retention:last_scan_at";
const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_LIST_LIMIT = 200;

interface Candidate {
  sourceType: RetentionSource;
  sourceId: string;
  bucket: string;
  objectPath: string;
  studentProfileId: string;
  semesterEndDate: Date;
}

const inScope = (cutoff: Date) => ({ studentProfile: { semester: { endDate: { lt: cutoff } } } });
const withSemester = { studentProfile: { select: { semester: { select: { endDate: true } } } } };

async function findCandidates(cutoff: Date): Promise<Candidate[]> {
  const [items, deviations, documents] = await Promise.all([
    prisma.preDeploymentChecklistItem.findMany({
      where: { filePath: { not: null }, ...inScope(cutoff) },
      select: { id: true, filePath: true, studentProfileId: true, ...withSemester },
    }),
    prisma.deviationReport.findMany({
      where: { proofUrl: { not: null }, ...inScope(cutoff) },
      select: { id: true, proofUrl: true, studentProfileId: true, ...withSemester },
    }),
    prisma.generatedDocument.findMany({
      where: { fileUrl: { not: null }, ...inScope(cutoff) },
      select: { id: true, fileUrl: true, studentProfileId: true, ...withSemester },
    }),
  ]);

  const out: Candidate[] = [];
  for (const r of items) {
    if (!r.filePath) continue;
    out.push({
      sourceType: RetentionSource.CHECKLIST,
      sourceId: r.id,
      bucket: CHECKLIST_BUCKET,
      objectPath: r.filePath,
      studentProfileId: r.studentProfileId,
      semesterEndDate: r.studentProfile.semester.endDate,
    });
  }
  for (const r of deviations) {
    // Legacy rows hold an external link, not a storage object.
    if (!r.proofUrl || !isStoragePath(r.proofUrl)) continue;
    out.push({
      sourceType: RetentionSource.DEVIATION_PROOF,
      sourceId: r.id,
      bucket: CHECKLIST_BUCKET,
      objectPath: r.proofUrl,
      studentProfileId: r.studentProfileId,
      semesterEndDate: r.studentProfile.semester.endDate,
    });
  }
  for (const r of documents) {
    if (!r.fileUrl) continue;
    out.push({
      sourceType: RetentionSource.GENERATED_DOCUMENT,
      sourceId: r.id,
      bucket: GENERATED_DOCUMENTS_BUCKET,
      objectPath: r.fileUrl,
      studentProfileId: r.studentProfileId,
      semesterEndDate: r.studentProfile.semester.endDate,
    });
  }
  return out;
}

export async function runRetentionScan(now: Date): Promise<{ ran: boolean; flagged: number }> {
  const last = await prisma.systemConfig.findUnique({
    where: { configKey: RETENTION_LAST_SCAN_KEY },
    select: { configValue: true },
  });
  const lastAt = typeof last?.configValue === "string" ? new Date(last.configValue) : null;
  if (
    lastAt &&
    !Number.isNaN(lastAt.getTime()) &&
    now.getTime() - lastAt.getTime() < RETENTION_SCAN_INTERVAL_DAYS * DAY_MS
  ) {
    return { ran: false, flagged: 0 };
  }

  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear() - RETENTION_YEARS, now.getUTCMonth(), now.getUTCDate())
  );
  const candidates = await findCandidates(cutoff);

  const existing =
    candidates.length === 0
      ? []
      : await prisma.retentionFlag.findMany({
          where: {
            OR: Object.values(RetentionSource).map((sourceType) => ({
              sourceType,
              sourceId: {
                in: candidates.filter((c) => c.sourceType === sourceType).map((c) => c.sourceId),
              },
            })),
          },
          select: { sourceType: true, sourceId: true },
        });
  const known = new Set(existing.map((e) => `${e.sourceType}:${e.sourceId}`));

  let flagged = 0;
  for (const c of candidates) {
    const isNew = !known.has(`${c.sourceType}:${c.sourceId}`);
    // update: {} so a KEPT or DELETED flag is never reset to PENDING.
    await prisma.retentionFlag.upsert({
      where: { sourceType_sourceId: { sourceType: c.sourceType, sourceId: c.sourceId } },
      create: {
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        bucket: c.bucket,
        objectPath: c.objectPath,
        studentProfileId: c.studentProfileId,
        semesterEndDate: c.semesterEndDate,
        status: RetentionStatus.PENDING,
      },
      update: {},
    });
    if (isNew) flagged += 1;
  }

  await prisma.systemConfig.upsert({
    where: { configKey: RETENTION_LAST_SCAN_KEY },
    create: { configKey: RETENTION_LAST_SCAN_KEY, configValue: now.toISOString() },
    update: { configValue: now.toISOString() },
  });
  await logEvent({
    userId: null,
    action: "RETENTION_SCAN",
    entityType: "RetentionFlag",
    detail: { flagged },
  });

  if (flagged > 0) {
    await notify({
      userIds: await getSuperAdminIds(),
      trigger: "RETENTION_REVIEW",
      title: "Files due for retention review",
      body: `${flagged} files are more than ${RETENTION_YEARS} years past their semester. Review them in the Export Center.`,
      link: "/admin/export-center#retention",
    });
  }
  return { ran: true, flagged };
}

export async function listPendingRetentionFlags() {
  const flags = await prisma.retentionFlag.findMany({
    where: { status: RetentionStatus.PENDING },
    orderBy: { semesterEndDate: "asc" },
    take: PENDING_LIST_LIMIT,
    select: {
      id: true,
      sourceType: true,
      studentProfileId: true,
      semesterEndDate: true,
      flaggedAt: true,
    },
  });
  if (flags.length === 0) return [];
  const profiles = await prisma.studentProfile.findMany({
    where: { id: { in: Array.from(new Set(flags.map((f) => f.studentProfileId))) } },
    select: { id: true, studentNumber: true },
  });
  const numbers = new Map(profiles.map((p) => [p.id, p.studentNumber]));
  return flags.map((f) => ({
    id: f.id,
    sourceType: f.sourceType,
    studentNumber: numbers.get(f.studentProfileId) ?? "—",
    semesterEndDate: f.semesterEndDate,
    flaggedAt: f.flaggedAt,
  }));
}

async function getPendingFlag(id: string) {
  const flag = await prisma.retentionFlag.findUnique({ where: { id } });
  if (!flag) throw new ComplianceNotFoundError("Retention flag not found");
  if (flag.status !== RetentionStatus.PENDING) {
    throw new RetentionStateError("This file was already reviewed");
  }
  return flag;
}

export async function keepRetentionFlag(id: string, actingUserId: string): Promise<void> {
  const flag = await getPendingFlag(id);
  await prisma.$transaction(async (tx) => {
    // Guarded write: a concurrent review that won the race leaves count 0 and no audit row.
    const { count } = await tx.retentionFlag.updateMany({
      where: { id, status: RetentionStatus.PENDING },
      data: { status: RetentionStatus.KEPT, reviewedAt: new Date(), reviewedBy: actingUserId },
    });
    if (count === 0) throw new RetentionStateError("This file was already reviewed");
    await logEvent(
      {
        userId: actingUserId,
        action: "RETENTION_KEPT",
        entityType: "RetentionFlag",
        entityId: id,
        detail: { sourceType: flag.sourceType, sourceId: flag.sourceId },
      },
      tx
    );
  });
}

// Clears the column only while it still points at the deleted object: a file re-uploaded
// since the scan keeps its new path.
function nullSourcePath(
  tx: Prisma.TransactionClient,
  type: RetentionSource,
  sourceId: string,
  objectPath: string
) {
  switch (type) {
    case RetentionSource.CHECKLIST:
      return tx.preDeploymentChecklistItem.updateMany({
        where: { id: sourceId, filePath: objectPath },
        data: { filePath: null },
      });
    case RetentionSource.DEVIATION_PROOF:
      return tx.deviationReport.updateMany({
        where: { id: sourceId, proofUrl: objectPath },
        data: { proofUrl: null },
      });
    case RetentionSource.GENERATED_DOCUMENT:
      return tx.generatedDocument.updateMany({
        where: { id: sourceId, fileUrl: objectPath },
        data: { fileUrl: null },
      });
  }
}

export async function deleteRetentionFlaggedFile(
  id: string,
  actingUserId: string,
  ip: string | null
): Promise<void> {
  const flag = await getPendingFlag(id);

  // Claim before storage, so a concurrent Keep that already won stops the delete.
  const { count } = await prisma.retentionFlag.updateMany({
    where: { id, status: RetentionStatus.PENDING },
    data: { status: RetentionStatus.DELETED, reviewedAt: new Date(), reviewedBy: actingUserId },
  });
  if (count === 0) throw new RetentionStateError("This file was already reviewed");

  // A missing object resolves (already gone); a failure releases the claim so it can be retried.
  try {
    await deleteObject(flag.bucket, flag.objectPath);
  } catch (error) {
    await prisma.retentionFlag.update({
      where: { id },
      data: { status: RetentionStatus.PENDING, reviewedAt: null, reviewedBy: null },
    });
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await nullSourcePath(tx, flag.sourceType, flag.sourceId, flag.objectPath);
    await logEvent(
      {
        userId: actingUserId,
        action: "FILE_DELETED",
        entityType: "RetentionFlag",
        entityId: id,
        ipAddress: ip,
        detail: {
          bucket: flag.bucket,
          objectPath: flag.objectPath,
          sourceType: flag.sourceType,
          sourceId: flag.sourceId,
        },
      },
      tx
    );
  });
}
