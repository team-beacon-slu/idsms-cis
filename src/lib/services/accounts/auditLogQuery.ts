import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Filters arrive from a GET form, so `from`/`to` are date-only (YYYY-MM-DD)
// strings that z.coerce.date() reads as UTC midnight.
export const auditLogFilterSchema = z.object({
  action: z.string().max(80).optional(),
  entityType: z.string().max(80).optional(),
  email: z.string().max(254).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type AuditLogFilter = z.infer<typeof auditLogFilterSchema>;

export type AuditLogRow = {
  id: string;
  timestamp: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  email: string | null;
  name: string | null; // the user's display name (staff); null for older accounts
  ipAddress: string | null;
  detail: unknown;
};

export const AUDIT_PAGE_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

// A date-only value (UTC midnight of the typed day) -> the instant that day
// begins in Manila (UTC+8, no DST).
const manilaDayStart = (dateOnly: Date) => new Date(dateOnly.getTime() - MANILA_OFFSET_MS);

function buildWhere(filter: AuditLogFilter): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (filter.action) where.action = filter.action;
  if (filter.entityType) where.entityType = filter.entityType;
  if (filter.email) where.user = { email: { contains: filter.email, mode: "insensitive" } };
  if (filter.from || filter.to) {
    where.timestamp = {
      ...(filter.from && { gte: manilaDayStart(filter.from) }),
      // `to` is inclusive of its whole Manila day.
      ...(filter.to && { lt: new Date(manilaDayStart(filter.to).getTime() + DAY_MS) }),
    };
  }
  return where;
}

// `max` (exports) takes the newest N rows from the start; otherwise `page`
// selects a window of `pageSize`.
export async function queryAuditLogs(
  filter: AuditLogFilter,
  opts: { pageSize?: number; max?: number } = {}
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const where = buildWhere(filter);
  const pageSize = opts.pageSize ?? AUDIT_PAGE_SIZE;
  const [records, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: opts.max ? 0 : (filter.page - 1) * pageSize,
      take: opts.max ?? pageSize,
      include: { user: { select: { email: true, fullName: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    rows: records.map(({ user, ...r }) => ({
      id: r.id,
      timestamp: r.timestamp,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      email: user?.email ?? null,
      name: user?.fullName ?? null,
      ipAddress: r.ipAddress,
      detail: r.detail,
    })),
    total,
  };
}
