// Immutable, append-only audit logging. See NFR-SEC-07, NFR-SEC-10 (append-only RLS).
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface LogEventInput {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  detail?: Prisma.InputJsonValue | null;
}

// Accepts a transaction client so callers that must log atomically with the
// state change they're describing (e.g. a lockout that also revokes sessions)
// can pass `tx` instead of the module-level `prisma` singleton.
export function logEvent(
  input: LogEventInput,
  client: PrismaClient | Prisma.TransactionClient = prisma
) {
  return client.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress ?? null,
      detail: input.detail ?? Prisma.JsonNull,
    },
  });
}
