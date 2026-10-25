// User management, RBAC, bulk CSV/Excel import, session revocation.
// See PRD Module 1 (FR-UM-*), especially FR-UM-11 (instant session revocation).
import { createHash, randomBytes } from "crypto";
import {
  ChecklistRequirementType,
  Prisma,
  PrismaClient,
  Program,
  Role,
  User,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/utils/password";
import { generateDefaultPassword } from "@/lib/utils/defaultPassword";
import { logEvent } from "@/lib/services/accounts/auditService";
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
    fullName: user.fullName,
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
//
// Shape: bcrypt is slow by design, so it runs OUTSIDE any transaction. An
// interactive transaction that spans it can exceed Prisma's timeout on a slow
// DB link ("Transaction already closed") and turn a plain wrong password into
// a 500. Instead: (1) pre-read the user and handle the cheap rejections,
// (2) verify the password with no transaction open, (3) open a SHORT
// transaction that re-reads the user, re-checks state, and applies the outcome.
// The failure counter uses an atomic increment and the lock decision uses the
// value the database returns, so a burst of concurrent failed attempts can't
// race past the threshold via a lost update.
// bcrypt hash (cost 12, as hashPassword) of a random string nobody knows.
const TIMING_DUMMY_HASH = "$2b$12$VDqK0XVzqtWrnyk.YMPj3OvYU.urBdV4zgVWMJ3JUeXDOlkBGLY9W";

export async function verifyCredentials(
  rawEmail: string,
  password: string,
  ipAddress?: string | null
): Promise<VerifyCredentialsResult> {
  // Emails are stored lowercase; a capital letter or a pasted trailing space must still sign in.
  const email = rawEmail.trim().toLowerCase();
  const pre = await prisma.user.findUnique({ where: { email } });

  if (!pre || pre.deletedAt) {
    // Same bcrypt cost as a real account, so response time doesn't reveal which emails exist.
    await verifyPassword(password, TIMING_DUMMY_HASH);
    await logEvent({
      userId: null,
      action: "LOGIN_FAILED",
      entityType: "User",
      ipAddress,
      detail: { email },
    });
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  if (!pre.isActive) {
    await logInactiveAttempt(pre.id, ipAddress, prisma);
    return { ok: false, reason: "ACCOUNT_INACTIVE" };
  }

  if (pre.lockedUntil && pre.lockedUntil > new Date()) {
    await logLockedAttempt(pre.id, ipAddress, prisma);
    return { ok: false, reason: "ACCOUNT_LOCKED", lockedUntil: pre.lockedUntil };
  }

  // Slow part — deliberately outside the transaction.
  const passwordMatches = await verifyPassword(password, pre.hashedPassword);

  return prisma.$transaction(
    async (tx): Promise<VerifyCredentialsResult> => {
      const now = new Date();
      const user = await tx.user.findUnique({ where: { id: pre.id } });
      const blocked = await rejectBlockedState(user, pre.hashedPassword, email, ipAddress, now, tx);
      if (blocked) return blocked;
      // rejectBlockedState returned null, so user is present.
      const fresh = user!;

      if (passwordMatches) {
        // Conditional write: a plain update(where: {id}) would re-check only the
        // id after waiting on a concurrent writer's row lock, and could clear a
        // lock (or accept a stale password) committed in the meantime. Under
        // READ COMMITTED the WHERE below is re-evaluated after that wait.
        const res = await tx.user.updateMany({
          where: {
            id: fresh.id,
            hashedPassword: pre.hashedPassword,
            OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
          },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });

        if (res.count === 0) {
          // Something changed under us; classify it. Never log LOGIN_SUCCESS here.
          const again = await tx.user.findUnique({ where: { id: fresh.id } });
          const rejected = await rejectBlockedState(
            again,
            pre.hashedPassword,
            email,
            ipAddress,
            new Date(),
            tx
          );
          if (rejected) return rejected;
          await logEvent(
            {
              userId: fresh.id,
              action: "LOGIN_FAILED",
              entityType: "User",
              entityId: fresh.id,
              ipAddress,
              detail: { reason: "concurrent_change" },
            },
            tx
          );
          return { ok: false, reason: "INVALID_CREDENTIALS" };
        }

        const updated = await tx.user.findUniqueOrThrow({ where: { id: fresh.id } });
        await logEvent(
          {
            userId: fresh.id,
            action: "LOGIN_SUCCESS",
            entityType: "User",
            entityId: fresh.id,
            ipAddress,
          },
          tx
        );
        return { ok: true, user: toSafeUser(updated) };
      }

      // Atomic increment; the returned value (not our stale read) decides the lock.
      const afterIncrement = await tx.user.update({
        where: { id: fresh.id },
        data: { failedLoginAttempts: { increment: 1 } },
      });
      const failedAttempts = afterIncrement.failedLoginAttempts;

      // The counter only resets on a successful login, so after an expired
      // lockout the next strike lands on 6, 7, ... and must lock again. Lock
      // whenever the threshold is reached and the returned row is not
      // currently locked. A returned row that IS currently locked means a
      // concurrent attempt already locked it: don't re-lock, re-revoke or
      // re-audit ACCOUNT_LOCKED.
      const currentlyLocked =
        afterIncrement.lockedUntil !== null && afterIncrement.lockedUntil > now;

      if (failedAttempts >= MAX_FAILED_ATTEMPTS && !currentlyLocked) {
        const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
        await tx.user.update({ where: { id: fresh.id }, data: { lockedUntil } });
        await revokeSessionsForUser(fresh.id, tx);
        await logEvent(
          {
            userId: fresh.id,
            action: "ACCOUNT_LOCKED",
            entityType: "User",
            entityId: fresh.id,
            ipAddress,
            detail: { failedAttempts },
          },
          tx
        );
        return { ok: false, reason: "ACCOUNT_LOCKED", lockedUntil };
      }

      if (currentlyLocked) {
        await logLockedAttempt(fresh.id, ipAddress, tx);
        return { ok: false, reason: "ACCOUNT_LOCKED", lockedUntil: afterIncrement.lockedUntil! };
      }

      await logEvent(
        {
          userId: fresh.id,
          action: "LOGIN_FAILED",
          entityType: "User",
          entityId: fresh.id,
          ipAddress,
          detail: { failedAttempts },
        },
        tx
      );
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    },
    { timeout: 15000, maxWait: 10000 }
  );
}

// Shared state gate for the fresh (in-transaction) row: deleted, inactive,
// locked, or password changed since the pre-read. Writes the audit row and
// returns the result to hand back, or null if the row is clear to proceed.
async function rejectBlockedState(
  user: User | null,
  preHash: string,
  email: string,
  ipAddress: string | null | undefined,
  now: Date,
  tx: Prisma.TransactionClient
): Promise<VerifyCredentialsResult | null> {
  if (!user || user.deletedAt) {
    await logEvent(
      { userId: null, action: "LOGIN_FAILED", entityType: "User", ipAddress, detail: { email } },
      tx
    );
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }
  if (!user.isActive) {
    await logInactiveAttempt(user.id, ipAddress, tx);
    return { ok: false, reason: "ACCOUNT_INACTIVE" };
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    await logLockedAttempt(user.id, ipAddress, tx);
    return { ok: false, reason: "ACCOUNT_LOCKED", lockedUntil: user.lockedUntil };
  }
  // The password was changed/reset while we were hashing: the comparison was
  // against a stale hash, so don't trust it and don't count a failure.
  if (user.hashedPassword !== preHash) {
    await logEvent(
      {
        userId: user.id,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        ipAddress,
        detail: { reason: "password_changed" },
      },
      tx
    );
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }
  return null;
}

function logInactiveAttempt(
  userId: string,
  ipAddress: string | null | undefined,
  client: PrismaClient | Prisma.TransactionClient
) {
  return logEvent(
    {
      userId,
      action: "LOGIN_FAILED",
      entityType: "User",
      entityId: userId,
      ipAddress,
      detail: { reason: "inactive" },
    },
    client
  );
}

function logLockedAttempt(
  userId: string,
  ipAddress: string | null | undefined,
  client: PrismaClient | Prisma.TransactionClient
) {
  return logEvent(
    {
      userId,
      action: "LOGIN_ATTEMPT_WHILE_LOCKED",
      entityType: "User",
      entityId: userId,
      ipAddress,
    },
    client
  );
}

// FR-UM-11(b)
export async function setUserActive(
  targetUserId: string,
  isActive: boolean,
  actingUserId: string,
  ipAddress?: string | null
): Promise<SafeUser> {
  if (!isActive && targetUserId === actingUserId) {
    throw new ForbiddenError("You can't deactivate your own account");
  }
  // Only a Super Admin manages staff accounts, so a coordinator can't lock out the admins.
  const [target, actor] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: actingUserId }, select: { role: true } }),
  ]);
  const staffTarget =
    target?.role === Role.SUPER_ADMIN || target?.role === Role.DEPARTMENT_COORDINATOR;
  if (staffTarget && actor?.role !== Role.SUPER_ADMIN) {
    throw new ForbiddenError("Only a Super Admin can change a staff account's status");
  }

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
  // Caps reset emails per account; the route's reply is identical either way, so nothing leaks.
  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= 3) {
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
  const invalid = { ok: false, reason: "INVALID_OR_EXPIRED_TOKEN" } as const;

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return invalid;
  }
  // bcrypt runs before the transaction so a slow hash can't hit its 5 s timeout.
  const hashedPassword = await hashPassword(newPassword);

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    // The conditional claim makes the link single-use even when two requests race.
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: resetToken.id, usedAt: null },
      data: { usedAt: now },
    });
    if (count === 0) return invalid;

    await tx.user.update({
      where: { id: resetToken.userId },
      data: { hashedPassword, mustResetPassword: false },
    });

    // Older links in the user's inbox stop working once the password changes.
    await tx.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null },
      data: { usedAt: now },
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

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "INVALID_CURRENT_PASSWORD" }
  | { ok: false; reason: "ACCOUNT_LOCKED"; lockedUntil: Date };

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
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, reason: "ACCOUNT_LOCKED", lockedUntil: user.lockedUntil };
  }

  // bcrypt stays outside the transaction so a slow hash can't hit its 5 s timeout.
  const matches = await verifyPassword(currentPassword, user.hashedPassword);
  if (!matches) {
    // FR-UM-07: wrong current passwords count toward the same lockout as sign-in.
    const after = await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    await logEvent({
      userId,
      action: "PASSWORD_CHANGE_FAILED",
      entityType: "User",
      entityId: userId,
      ipAddress,
    });
    if ((after?.failedLoginAttempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
      await prisma.user.update({ where: { id: userId }, data: { lockedUntil } });
      // Whoever is guessing holds a session, so every session ends, this one included.
      await revokeSessionsForUser(userId);
      return { ok: false, reason: "ACCOUNT_LOCKED", lockedUntil };
    }
    return { ok: false, reason: "INVALID_CURRENT_PASSWORD" };
  }

  const hashedPassword = await hashPassword(newPassword);
  return prisma.$transaction(async (tx) => {
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

// Account settings → Security: other devices still signed in (a lab PC, a lost phone).
// Sessions store no device details, and collecting them would be more personal data, so
// this is a count plus one action, not a device list.
export async function countOtherSessions(
  userId: string,
  currentSessionToken: string | null,
  now: Date = new Date()
): Promise<number> {
  return prisma.session.count({
    where: {
      userId,
      expires: { gt: now },
      ...(currentSessionToken ? { sessionToken: { not: currentSessionToken } } : {}),
    },
  });
}

export async function signOutOtherSessions(
  userId: string,
  currentSessionToken: string,
  ipAddress?: string | null
): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { userId, sessionToken: { not: currentSessionToken } },
  });
  await logEvent({
    userId,
    action: "OTHER_SESSIONS_SIGNED_OUT",
    entityType: "User",
    entityId: userId,
    ipAddress,
    detail: { count },
  });
  return count;
}

export interface BulkImportInputRow {
  // The row's position in the original uploaded file — callers filter out
  // zod-invalid rows before this function ever sees them, so this can't be
  // recomputed from the array index here without misreporting which
  // spreadsheet row a result actually corresponds to.
  rowNumber: number;
  row: BulkImportRow;
}

// A student profile and its checklist rows (one per requirement type), for the bulk import
// and for beta Google onboarding alike. Seeding every row now rather than lazily on first
// view makes "every student has one row per requirement" an invariant enforced once here instead of a
// defensive check every read path would otherwise need to reimplement (checklistService).
async function createStudentProfile(
  tx: Prisma.TransactionClient,
  data: Prisma.StudentProfileUncheckedCreateInput
) {
  const studentProfile = await tx.studentProfile.create({ data });
  await tx.preDeploymentChecklistItem.createMany({
    data: Object.values(ChecklistRequirementType).map((requirementType) => ({
      studentProfileId: studentProfile.id,
      requirementType,
    })),
  });
  return studentProfile;
}

// Beta Google sign-in: a student who signed in with their SLU Google account gives their
// student number and picks their class group; the program, semester (the active one) and
// required hours follow from those, as the coordinator's import would have set them.
export async function completeOwnStudentProfile(
  userId: string,
  input: { studentNumber: string; classGroupId: string },
  requiredHoursFor: (program: Program) => Promise<number>
): Promise<{ studentProfileId: string }> {
  const [user, group, semester] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, studentProfile: { select: { id: true } } },
    }),
    prisma.classGroup.findFirst({
      where: { id: input.classGroupId, deletedAt: null },
      select: { id: true, program: true },
    }),
    prisma.semester.findFirst({ where: { isActive: true }, select: { id: true } }),
  ]);
  if (!user || user.role !== Role.STUDENT_INTERN) throw new ForbiddenError();
  if (user.studentProfile) throw new OnboardingError("Your student profile is already set up.");
  if (!group) throw new OnboardingError("That class group no longer exists.");
  if (!semester) throw new OnboardingError("No semester is open yet. Ask your coordinator.");
  const taken = await prisma.studentProfile.findUnique({
    where: { studentNumber: input.studentNumber },
    select: { id: true },
  });
  if (taken) throw new OnboardingError("That student number is already registered.");
  const requiredHours = await requiredHoursFor(group.program);

  return prisma.$transaction(async (tx) => {
    const profile = await createStudentProfile(tx, {
      userId,
      studentNumber: input.studentNumber,
      program: group.program,
      classGroupId: group.id,
      semesterId: semester.id,
      requiredHours,
    });
    await logEvent(
      {
        userId,
        action: "STUDENT_SELF_ONBOARDED",
        entityType: "User",
        entityId: userId,
        detail: { studentNumber: input.studentNumber, classGroupId: group.id },
      },
      tx
    );
    return { studentProfileId: profile.id };
  });
}

// A message written for the student, shown as-is on the onboarding form.
export class OnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingError";
  }
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
      // bcrypt (~0.3 s) before the transaction opens: inside it, a slow link could hit the
      // 5 s interactive-transaction timeout and skip a valid student.
      const plaintextPassword = generateDefaultPassword(row.studentNumber);
      const hashedPassword = await hashPassword(plaintextPassword);
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

        const user = await tx.user.create({
          data: {
            email: row.email,
            hashedPassword,
            role: Role.STUDENT_INTERN,
            mustResetPassword: true,
          },
        });

        await createStudentProfile(tx, {
          userId: user.id,
          studentNumber: row.studentNumber,
          program: row.program,
          classGroupId,
          semesterId,
          requiredHours: row.requiredHours,
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
  ipAddress?: string | null,
  fullName?: string | null
): Promise<{ user: SafeUser; temporaryPassword: string }> {
  const temporaryPassword = randomBytes(12).toString("base64url");
  const hashedPassword = await hashPassword(temporaryPassword);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, hashedPassword, role, mustResetPassword: true, fullName: fullName ?? null },
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
    // People are found by email or name, or for students by student number.
    ...(filters.search
      ? {
          OR: [
            { email: { contains: filters.search, mode: "insensitive" } },
            { fullName: { contains: filters.search, mode: "insensitive" } },
            { studentProfile: { fullName: { contains: filters.search, mode: "insensitive" } } },
            {
              studentProfile: { studentNumber: { contains: filters.search, mode: "insensitive" } },
            },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { studentProfile: { select: { fullName: true, studentNumber: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((u) => ({
      ...toSafeUser(u),
      name: u.studentProfile?.fullName || u.fullName || null,
      studentNumber: u.studentProfile?.studentNumber ?? null,
    })),
    total,
    page,
    pageSize,
  };
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
