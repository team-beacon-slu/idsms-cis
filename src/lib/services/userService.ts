// User management, RBAC, bulk CSV/Excel import, session revocation.
// See PRD Module 1 (FR-UM-*), especially FR-UM-11 (instant session revocation).
import { createHash, randomBytes } from "crypto";
import { Prisma, PrismaClient, Role, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/utils/password";
import { generateDefaultPassword } from "@/lib/utils/defaultPassword";
import { logEvent } from "@/lib/services/auditService";
import type { BulkImportRow } from "@/lib/validators/user";
import type { BulkImportResult, BulkImportRowResult, SafeUser } from "@/types/user";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // FR-UM-10
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // FR-UM-10 — 1 hour

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustResetPassword: user.mustResetPassword,
    lockedUntil: user.lockedUntil,
    createdAt: user.createdAt,
  };
}

// The shared FR-UM-11 primitive. Every trigger below (lockout, deactivation,
// forced logout, password reset) calls this instead of deleting sessions
// inline, so "instant revocation" always means the same thing everywhere.
export function revokeSessionsForUser(
  userId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma
) {
  return client.session.deleteMany({ where: { userId } });
}

export type VerifyCredentialsResult =
  | { ok: true; user: SafeUser }
  | { ok: false; reason: "INVALID_CREDENTIALS" }
  | { ok: false; reason: "ACCOUNT_LOCKED"; lockedUntil: Date }
  | { ok: false; reason: "ACCOUNT_INACTIVE" };

// FR-UM-07 (lockout after 5 failed attempts), FR-UM-08 (audit every attempt),
// FR-UM-10 (15-minute lockout), FR-UM-11(a) (lock revokes active sessions).
// Runs as one transaction so a burst of concurrent failed attempts can't race
// past the threshold via a lost update.
export async function verifyCredentials(
  email: string,
  password: string,
  ipAddress?: string | null
): Promise<VerifyCredentialsResult> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });

    if (!user || user.deletedAt) {
      await logEvent(
        { userId: null, action: "LOGIN_FAILED", entityType: "User", ipAddress, detail: { email } },
        tx
      );
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }

    if (!user.isActive) {
      await logEvent(
        {
          userId: user.id,
          action: "LOGIN_FAILED",
          entityType: "User",
          entityId: user.id,
          ipAddress,
          detail: { reason: "inactive" },
        },
        tx
      );
      return { ok: false, reason: "ACCOUNT_INACTIVE" };
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      await logEvent(
        {
          userId: user.id,
          action: "LOGIN_ATTEMPT_WHILE_LOCKED",
          entityType: "User",
          entityId: user.id,
          ipAddress,
        },
        tx
      );
      return { ok: false, reason: "ACCOUNT_LOCKED", lockedUntil: user.lockedUntil };
    }

    const passwordMatches = await verifyPassword(password, user.hashedPassword);

    if (passwordMatches) {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
      await logEvent(
        {
          userId: user.id,
          action: "LOGIN_SUCCESS",
          entityType: "User",
          entityId: user.id,
          ipAddress,
        },
        tx
      );
      return { ok: true, user: toSafeUser(updated) };
    }

    const failedAttempts = user.failedLoginAttempts + 1;
    const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = shouldLock ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null;

    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: failedAttempts, lockedUntil },
    });

    if (shouldLock) {
      await revokeSessionsForUser(user.id, tx);
      await logEvent(
        {
          userId: user.id,
          action: "ACCOUNT_LOCKED",
          entityType: "User",
          entityId: user.id,
          ipAddress,
          detail: { failedAttempts },
        },
        tx
      );
      return { ok: false, reason: "ACCOUNT_LOCKED", lockedUntil: lockedUntil! };
    }

    await logEvent(
      {
        userId: user.id,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        ipAddress,
        detail: { failedAttempts },
      },
      tx
    );
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  });
}

// FR-UM-11(b)
export async function setUserActive(
  targetUserId: string,
  isActive: boolean,
  actingUserId: string,
  ipAddress?: string | null
): Promise<SafeUser> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: targetUserId }, data: { isActive } });

    if (!isActive) {
      await revokeSessionsForUser(targetUserId, tx);
    }

    await logEvent(
      {
        userId: actingUserId,
        action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        entityType: "User",
        entityId: targetUserId,
        ipAddress,
      },
      tx
    );

    return toSafeUser(user);
  });
}

// FR-UM-11(c)
export async function forceLogout(
  targetUserId: string,
  actingUserId: string,
  ipAddress?: string | null
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await revokeSessionsForUser(targetUserId, tx);
    await logEvent(
      {
        userId: actingUserId,
        action: "FORCE_LOGOUT",
        entityType: "User",
        entityId: targetUserId,
        ipAddress,
      },
      tx
    );
  });
}

// Super Admin manual unlock — the other half of FR-UM-10's lockout release.
export async function unlockAccount(
  targetUserId: string,
  actingUserId: string,
  ipAddress?: string | null
): Promise<SafeUser> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "ACCOUNT_UNLOCKED",
        entityType: "User",
        entityId: targetUserId,
        ipAddress,
      },
      tx
    );
    return toSafeUser(user);
  });
}

// FR-UM-10 password reset request. Always returns null for an unknown/inactive
// email — the caller (API route) must respond identically either way so the
// response itself never reveals whether an account exists.
export async function requestPasswordReset(
  email: string,
  ipAddress?: string | null
): Promise<{ token: string; userId: string } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || !user.isActive) {
    return null;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  await logEvent({
    userId: user.id,
    action: "PASSWORD_RESET_REQUESTED",
    entityType: "User",
    entityId: user.id,
    ipAddress,
  });

  return { token: rawToken, userId: user.id };
}

export type CompletePasswordResetResult =
  { ok: true } | { ok: false; reason: "INVALID_OR_EXPIRED_TOKEN" };

// FR-UM-11(d). Deliberately does NOT clear lockedUntil — per FR-UM-10 a reset
// does not lift a lockout, only the 15-minute timer or a Super Admin unlock does.
export async function completePasswordReset(
  rawToken: string,
  newPassword: string,
  ipAddress?: string | null
): Promise<CompletePasswordResetResult> {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  return prisma.$transaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return { ok: false, reason: "INVALID_OR_EXPIRED_TOKEN" };
    }

    const hashedPassword = await hashPassword(newPassword);

    await tx.user.update({
      where: { id: resetToken.userId },
      data: { hashedPassword, mustResetPassword: false },
    });

    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    await revokeSessionsForUser(resetToken.userId, tx);

    await logEvent(
      {
        userId: resetToken.userId,
        action: "PASSWORD_RESET_COMPLETED",
        entityType: "User",
        entityId: resetToken.userId,
        ipAddress,
      },
      tx
    );

    return { ok: true };
  });
}

export type ChangePasswordResult = { ok: true } | { ok: false; reason: "INVALID_CURRENT_PASSWORD" };

// Serves both the FR-UM-04 forced first-login change and a voluntary profile
// password change — same operation either way. Revokes every *other* session
// for this account but keeps the one making this request alive.
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionToken: string,
  ipAddress?: string | null
): Promise<ChangePasswordResult> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    const matches = await verifyPassword(currentPassword, user.hashedPassword);
    if (!matches) {
      await logEvent(
        {
          userId,
          action: "PASSWORD_CHANGE_FAILED",
          entityType: "User",
          entityId: userId,
          ipAddress,
        },
        tx
      );
      return { ok: false, reason: "INVALID_CURRENT_PASSWORD" };
    }

    const hashedPassword = await hashPassword(newPassword);
    await tx.user.update({
      where: { id: userId },
      data: { hashedPassword, mustResetPassword: false },
    });

    await tx.session.deleteMany({
      where: { userId, sessionToken: { not: currentSessionToken } },
    });

    await logEvent(
      { userId, action: "PASSWORD_CHANGED", entityType: "User", entityId: userId, ipAddress },
      tx
    );

    return { ok: true };
  });
}

export interface BulkImportInputRow {
  // The row's position in the original uploaded file — callers filter out
  // zod-invalid rows before this function ever sees them, so this can't be
  // recomputed from the array index here without misreporting which
  // spreadsheet row a result actually corresponds to.
  rowNumber: number;
  row: BulkImportRow;
}

// FR-UM-02/FR-UM-03. Per-row transactions so one bad row (duplicate email,
// duplicate student number) doesn't fail the whole batch.
export async function bulkImportStudents(
  inputRows: BulkImportInputRow[],
  classGroupId: string,
  semesterId: string,
  actingUserId: string,
  ipAddress?: string | null
): Promise<BulkImportResult> {
  const results: BulkImportRowResult[] = [];

  for (let index = 0; index < inputRows.length; index++) {
    const { rowNumber, row } = inputRows[index];

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const existingEmail = await tx.user.findUnique({ where: { email: row.email } });
        if (existingEmail) {
          return { status: "skipped" as const, reason: "Email already exists" };
        }

        const existingStudentNumber = await tx.studentProfile.findUnique({
          where: { studentNumber: row.studentNumber },
        });
        if (existingStudentNumber) {
          return { status: "skipped" as const, reason: "Student number already exists" };
        }

        const plaintextPassword = generateDefaultPassword(row.studentNumber);
        const hashedPassword = await hashPassword(plaintextPassword);

        const user = await tx.user.create({
          data: {
            email: row.email,
            hashedPassword,
            role: Role.STUDENT_INTERN,
            mustResetPassword: true,
          },
        });

        await tx.studentProfile.create({
          data: {
            userId: user.id,
            studentNumber: row.studentNumber,
            program: row.program,
            classGroupId,
            semesterId,
            requiredHours: row.requiredHours,
          },
        });

        await logEvent(
          {
            userId: actingUserId,
            action: "STUDENT_IMPORTED",
            entityType: "User",
            entityId: user.id,
            ipAddress,
            detail: { studentNumber: row.studentNumber },
          },
          tx
        );

        return { status: "created" as const, temporaryPassword: plaintextPassword };
      });

      results.push({
        rowNumber,
        studentNumber: row.studentNumber,
        email: row.email,
        status: outcome.status,
        temporaryPassword: outcome.status === "created" ? outcome.temporaryPassword : undefined,
        reason: outcome.status === "skipped" ? outcome.reason : undefined,
      });
    } catch (error) {
      results.push({
        rowNumber,
        studentNumber: row.studentNumber,
        email: row.email,
        status: "skipped",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    totalRows: inputRows.length,
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}

// FR-UM-09's ownership primitive — every later phase's services should route
// student-record access through this rather than re-deriving the rule.
export async function assertCanAccessStudent(
  actingUser: { id: string; role: Role },
  studentProfileId: string
): Promise<void> {
  if (actingUser.role === Role.SUPER_ADMIN || actingUser.role === Role.DEPARTMENT_COORDINATOR) {
    return;
  }

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { userId: true, classGroupId: true, semesterId: true },
  });

  if (!studentProfile) {
    throw new ForbiddenError("Student not found");
  }

  if (actingUser.role === Role.STUDENT_INTERN) {
    if (studentProfile.userId !== actingUser.id) {
      throw new ForbiddenError();
    }
    return;
  }

  if (actingUser.role === Role.FACULTY_ADVISER) {
    const link = await prisma.facultyClassGroup.findFirst({
      where: {
        facultyId: actingUser.id,
        classGroupId: studentProfile.classGroupId,
        semesterId: studentProfile.semesterId,
      },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenError();
    }
    return;
  }

  throw new ForbiddenError();
}

// The other half of account creation alongside bulkImportStudents — that one
// is students-only (from a class list); this covers the three staff roles,
// created one at a time by a Super Admin. Same "surface the plaintext once"
// pattern as FR-UM-03, just with a random password instead of a derived one
// since there's no student number to derive it from.
export async function createUser(
  email: string,
  role: Role,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ user: SafeUser; temporaryPassword: string }> {
  const temporaryPassword = randomBytes(12).toString("base64url");
  const hashedPassword = await hashPassword(temporaryPassword);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, hashedPassword, role, mustResetPassword: true },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: created.id,
        ipAddress,
        detail: { role },
      },
      tx
    );
    return created;
  });

  return { user: toSafeUser(user), temporaryPassword };
}

export interface ListUsersFilters {
  role?: Role;
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listUsers(filters: ListUsersFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.search ? { email: { contains: filters.search, mode: "insensitive" } } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { users: users.map(toSafeUser), total, page, pageSize };
}

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentProfile: true },
  });

  if (!user || user.deletedAt) {
    return null;
  }

  return { ...toSafeUser(user), studentProfile: user.studentProfile };
}
