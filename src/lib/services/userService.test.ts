import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { Role } from "@prisma/client";
import {
  ForbiddenError,
  assertCanAccessStudent,
  bulkImportStudents,
  changePassword,
  completePasswordReset,
  createUser,
  forceLogout,
  getUserProfile,
  listUsers,
  requestPasswordReset,
  setUserActive,
  unlockAccount,
  verifyCredentials,
} from "@/lib/services/userService";
import { hashPassword, verifyPassword } from "@/lib/utils/password";
import { generateDefaultPassword } from "@/lib/utils/defaultPassword";

jest.mock("@/lib/utils/password");
jest.mock("@/lib/utils/defaultPassword");

const mockedVerifyPassword = verifyPassword as jest.MockedFunction<typeof verifyPassword>;
const mockedHashPassword = hashPassword as jest.MockedFunction<typeof hashPassword>;
const mockedGenerateDefaultPassword = generateDefaultPassword as jest.MockedFunction<
  typeof generateDefaultPassword
>;

function baseUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-1",
    email: "student@example.com",
    hashedPassword: "hashed",
    role: Role.STUDENT_INTERN,
    isActive: true,
    mustResetPassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetPrismaMock();
  mockedVerifyPassword.mockReset();
  mockedHashPassword.mockResolvedValue("new-hashed-password");
  mockedGenerateDefaultPassword.mockReturnValue("GENERATED1");
});

describe("verifyCredentials", () => {
  it("rejects an unknown email without revealing it doesn't exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await verifyCredentials("nobody@example.com", "whatever");

    expect(result).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "LOGIN_FAILED", userId: null }),
      })
    );
  });

  it("rejects a soft-deleted user as if they don't exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ deletedAt: new Date() }) as never);

    const result = await verifyCredentials("student@example.com", "whatever");

    expect(result).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
  });

  it("rejects an inactive account", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ isActive: false }) as never);

    const result = await verifyCredentials("student@example.com", "whatever");

    expect(result).toEqual({ ok: false, reason: "ACCOUNT_INACTIVE" });
  });

  it("rejects while locked, without re-checking the password or incrementing attempts", async () => {
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ lockedUntil }) as never);

    const result = await verifyCredentials("student@example.com", "correct-password");

    expect(result).toEqual({ ok: false, reason: "ACCOUNT_LOCKED", lockedUntil });
    expect(mockedVerifyPassword).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("logs in successfully on a correct password and resets the failure counter", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 3 }) as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(
      baseUser({ failedLoginAttempts: 0 }) as never
    );
    mockedVerifyPassword.mockResolvedValue(true);

    const result = await verifyCredentials("student@example.com", "correct-password");

    expect(result.ok).toBe(true);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "user-1", hashedPassword: "hashed" }),
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
    );
  });

  it("increments the failure counter atomically on a wrong password without locking below the threshold", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 2 }) as never);
    prismaMock.user.update.mockResolvedValue(baseUser({ failedLoginAttempts: 3 }) as never);
    mockedVerifyPassword.mockResolvedValue(false);

    const result = await verifyCredentials("student@example.com", "wrong-password");

    expect(result).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedLoginAttempts: { increment: 1 } } })
    );
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it("locks the account and revokes sessions on the 5th consecutive failure (FR-UM-07/FR-UM-11a)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 4 }) as never);
    prismaMock.user.update.mockResolvedValue(baseUser({ failedLoginAttempts: 5 }) as never);
    mockedVerifyPassword.mockResolvedValue(false);

    const result = await verifyCredentials("student@example.com", "wrong-password");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ACCOUNT_LOCKED");
    }
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedLoginAttempts: { increment: 1 } } })
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lockedUntil: expect.any(Date) } })
    );
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ACCOUNT_LOCKED" }) })
    );
  });

  it("decides the lock from the atomically returned count, not the stale pre-read (concurrent failures)", async () => {
    // Pre-read saw 1 failure, but concurrent attempts pushed the DB counter so
    // the increment returns 5: this attempt must lock.
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 1 }) as never);
    prismaMock.user.update.mockResolvedValue(baseUser({ failedLoginAttempts: 5 }) as never);
    mockedVerifyPassword.mockResolvedValue(false);

    const result = await verifyCredentials("student@example.com", "wrong-password");

    expect(result).toMatchObject({ ok: false, reason: "ACCOUNT_LOCKED" });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("runs the transaction with a 15s timeout / 10s maxWait", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser() as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(baseUser() as never);
    mockedVerifyPassword.mockResolvedValue(true);

    await verifyCredentials("student@example.com", "correct-password");

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 15000, maxWait: 10000 })
    );
  });

  it("finishes bcrypt verification before opening the transaction", async () => {
    const order: string[] = [];
    prismaMock.user.findUnique.mockResolvedValue(baseUser() as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(baseUser() as never);
    mockedVerifyPassword.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push("verifyPassword:done");
      return true;
    });
    const impl = prismaMock.$transaction.getMockImplementation()!;
    prismaMock.$transaction.mockImplementation(((cb: unknown, opts: unknown) => {
      order.push("transaction:start");
      return (impl as (a: unknown, b: unknown) => unknown)(cb, opts);
    }) as typeof prismaMock.$transaction);

    await verifyCredentials("student@example.com", "correct-password");

    expect(order).toEqual(["verifyPassword:done", "transaction:start"]);
  });

  it("returns ACCOUNT_LOCKED when the account got locked between the pre-read and the fresh read", async () => {
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
    prismaMock.user.findUnique
      .mockResolvedValueOnce(baseUser() as never)
      .mockResolvedValueOnce(baseUser({ lockedUntil }) as never);
    mockedVerifyPassword.mockResolvedValue(true);

    const result = await verifyCredentials("student@example.com", "correct-password");

    expect(result).toEqual({ ok: false, reason: "ACCOUNT_LOCKED", lockedUntil });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "LOGIN_ATTEMPT_WHILE_LOCKED" }),
      })
    );
  });

  it("returns ACCOUNT_INACTIVE when the account was deactivated between the pre-read and the fresh read", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(baseUser() as never)
      .mockResolvedValueOnce(baseUser({ isActive: false }) as never);
    mockedVerifyPassword.mockResolvedValue(true);

    const result = await verifyCredentials("student@example.com", "correct-password");

    expect(result).toEqual({ ok: false, reason: "ACCOUNT_INACTIVE" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects without counting a failure when the password hash changed mid-flight", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(baseUser() as never)
      .mockResolvedValueOnce(baseUser({ hashedPassword: "rotated" }) as never);
    mockedVerifyPassword.mockResolvedValue(true);

    const result = await verifyCredentials("student@example.com", "old-password");

    expect(result).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "LOGIN_FAILED",
          detail: { reason: "password_changed" },
        }),
      })
    );
  });

  it("does not log in when the conditional success write matches nothing because a lock committed concurrently", async () => {
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
    prismaMock.user.findUnique
      .mockResolvedValueOnce(baseUser() as never) // pre-read
      .mockResolvedValueOnce(baseUser() as never) // fresh read: still looks unlocked
      .mockResolvedValueOnce(baseUser({ lockedUntil }) as never); // re-read after count 0
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
    mockedVerifyPassword.mockResolvedValue(true);

    const result = await verifyCredentials("student@example.com", "correct-password");

    expect(result).toEqual({ ok: false, reason: "ACCOUNT_LOCKED", lockedUntil });
    expect(prismaMock.user.findUniqueOrThrow).not.toHaveBeenCalled();
    const actions = prismaMock.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(["LOGIN_ATTEMPT_WHILE_LOCKED"]);
  });

  it("does not log in when count is 0 because the password hash changed concurrently", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(baseUser() as never)
      .mockResolvedValueOnce(baseUser() as never)
      .mockResolvedValueOnce(baseUser({ hashedPassword: "rotated" }) as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
    mockedVerifyPassword.mockResolvedValue(true);

    const result = await verifyCredentials("student@example.com", "old-password");

    expect(result).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "LOGIN_FAILED",
          detail: { reason: "password_changed" },
        }),
      })
    );
    const actions = prismaMock.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(actions).not.toContain("LOGIN_SUCCESS");
  });

  it("does not re-lock, re-revoke sessions or re-audit ACCOUNT_LOCKED when the increment lands past the threshold", async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 4 }) as never);
    prismaMock.user.update.mockResolvedValue(
      baseUser({ failedLoginAttempts: 6, lockedUntil }) as never
    );
    mockedVerifyPassword.mockResolvedValue(false);

    const result = await verifyCredentials("student@example.com", "wrong-password");

    expect(result).toEqual({ ok: false, reason: "ACCOUNT_LOCKED", lockedUntil });
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
    const actions = prismaMock.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(["LOGIN_ATTEMPT_WHILE_LOCKED"]);
  });

  it.each([
    ["unknown email", null],
    ["inactive account", baseUser({ isActive: false })],
    ["locked account", baseUser({ lockedUntil: new Date(Date.now() + 60_000) })],
  ])("pre-read rejection (%s) never opens a transaction or runs bcrypt", async (_n, row) => {
    prismaMock.user.findUnique.mockResolvedValue(row as never);

    await verifyCredentials("student@example.com", "whatever");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(mockedVerifyPassword).not.toHaveBeenCalled();
  });

  it("does not increment the failure counter for a WRONG password when the hash changed mid-flight", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(baseUser() as never)
      .mockResolvedValueOnce(baseUser({ hashedPassword: "rotated" }) as never);
    mockedVerifyPassword.mockResolvedValue(false);

    const result = await verifyCredentials("student@example.com", "wrong-password");

    expect(result).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("does not lock again or re-revoke sessions on a login attempt that arrives just past the lockout expiry", async () => {
    // lockedUntil in the past — verifyCredentials should treat this account as
    // unlocked and fall through to the normal password check, not a fresh lock.
    const pastLock = new Date(Date.now() - 1000);
    prismaMock.user.findUnique.mockResolvedValue(
      baseUser({ lockedUntil: pastLock, failedLoginAttempts: 5 }) as never
    );
    mockedVerifyPassword.mockResolvedValue(true);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(
      baseUser({ failedLoginAttempts: 0 }) as never
    );

    const result = await verifyCredentials("student@example.com", "correct-password");

    expect(result.ok).toBe(true);
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
  });
});

describe("FR-UM-11 session revocation triggers", () => {
  it("setUserActive(false) revokes sessions (trigger b)", async () => {
    prismaMock.user.update.mockResolvedValue(baseUser({ isActive: false }) as never);

    await setUserActive("user-1", false, "admin-1");

    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("setUserActive(true) does not revoke sessions", async () => {
    prismaMock.user.update.mockResolvedValue(baseUser({ isActive: true }) as never);

    await setUserActive("user-1", true, "admin-1");

    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it("forceLogout revokes sessions (trigger c)", async () => {
    await forceLogout("user-1", "admin-1");

    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("completePasswordReset revokes sessions on success (trigger d)", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    } as never);

    const result = await completePasswordReset("raw-token", "new-password");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });
});

describe("completePasswordReset", () => {
  it("rejects a token that doesn't exist", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

    const result = await completePasswordReset("bad-token", "new-password");

    expect(result).toEqual({ ok: false, reason: "INVALID_OR_EXPIRED_TOKEN" });
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects an already-used token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 60 * 1000),
      usedAt: new Date(),
      createdAt: new Date(),
    } as never);

    const result = await completePasswordReset("raw-token", "new-password");

    expect(result).toEqual({ ok: false, reason: "INVALID_OR_EXPIRED_TOKEN" });
  });

  it("rejects an expired token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      tokenHash: "hash",
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
      createdAt: new Date(),
    } as never);

    const result = await completePasswordReset("raw-token", "new-password");

    expect(result).toEqual({ ok: false, reason: "INVALID_OR_EXPIRED_TOKEN" });
  });

  it("does not touch lockedUntil on success (FR-UM-10: reset does not lift a lockout)", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    } as never);

    await completePasswordReset("raw-token", "new-password");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { hashedPassword: "new-hashed-password", mustResetPassword: false },
    });
  });
});

describe("changePassword", () => {
  it("rejects an incorrect current password without touching sessions", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(baseUser() as never);
    mockedVerifyPassword.mockResolvedValue(false);

    const result = await changePassword("user-1", "wrong-current", "new-pass", "session-a");

    expect(result).toEqual({ ok: false, reason: "INVALID_CURRENT_PASSWORD" });
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps the calling session alive and revokes every other one", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(baseUser() as never);
    mockedVerifyPassword.mockResolvedValue(true);

    const result = await changePassword("user-1", "correct-current", "new-pass", "session-a");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", sessionToken: { not: "session-a" } },
    });
  });
});

describe("unlockAccount", () => {
  it("clears failedLoginAttempts and lockedUntil", async () => {
    prismaMock.user.update.mockResolvedValue(baseUser() as never);

    await unlockAccount("user-1", "admin-1");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });
});

describe("requestPasswordReset", () => {
  it("returns null for an unknown email without creating a token", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await requestPasswordReset("nobody@example.com");

    expect(result).toBeNull();
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("returns null for an inactive account without creating a token", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ isActive: false }) as never);

    const result = await requestPasswordReset("student@example.com");

    expect(result).toBeNull();
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("creates a token and returns the raw value for a valid account", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser() as never);
    prismaMock.passwordResetToken.create.mockResolvedValue({} as never);

    const result = await requestPasswordReset("student@example.com");

    expect(result).not.toBeNull();
    expect(result?.token).toHaveLength(64); // 32 bytes hex-encoded
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1);
  });
});

describe("bulkImportStudents", () => {
  it("preserves each row's original spreadsheet row number in the result, including after a skip", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(baseUser() as never) // row 3 (rowNumber 3): duplicate email -> skipped
      .mockResolvedValueOnce(null); // row 7 (rowNumber 7): proceeds
    prismaMock.studentProfile.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(baseUser({ id: "new-user" }) as never);
    prismaMock.studentProfile.create.mockResolvedValue({} as never);

    const result = await bulkImportStudents(
      [
        {
          rowNumber: 3,
          row: {
            studentNumber: "2021-00001",
            email: "dup@example.com",
            program: "BSIT" as never,
            requiredHours: 486,
          },
        },
        {
          rowNumber: 7,
          row: {
            studentNumber: "2021-00002",
            email: "new@example.com",
            program: "BSIT" as never,
            requiredHours: 486,
          },
        },
      ],
      "class-group-1",
      "semester-1",
      "admin-1"
    );

    expect(result.totalRows).toBe(2);
    expect(result.results.map((r) => r.rowNumber)).toEqual([3, 7]);
    expect(result.results[0].status).toBe("skipped");
    expect(result.results[1].status).toBe("created");
  });

  it("skips a row whose student number already exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.studentProfile.findUnique.mockResolvedValue({ id: "existing" } as never);

    const result = await bulkImportStudents(
      [
        {
          rowNumber: 2,
          row: {
            studentNumber: "2021-00001",
            email: "new@example.com",
            program: "BSIT" as never,
            requiredHours: 486,
          },
        },
      ],
      "class-group-1",
      "semester-1",
      "admin-1"
    );

    expect(result.results[0]).toMatchObject({
      status: "skipped",
      reason: "Student number already exists",
    });
  });

  it("records a row as skipped if its transaction throws unexpectedly", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("connection reset"));

    const result = await bulkImportStudents(
      [
        {
          rowNumber: 2,
          row: {
            studentNumber: "2021-00001",
            email: "new@example.com",
            program: "BSIT" as never,
            requiredHours: 486,
          },
        },
      ],
      "class-group-1",
      "semester-1",
      "admin-1"
    );

    expect(result.results[0]).toMatchObject({ status: "skipped", reason: "connection reset" });
  });
});

describe("createUser", () => {
  it("creates a staff user with a temporary password and mustResetPassword set", async () => {
    prismaMock.user.create.mockResolvedValue(
      baseUser({ id: "new-staff", role: Role.FACULTY_ADVISER }) as never
    );

    const result = await createUser("faculty@example.com", Role.FACULTY_ADVISER, "admin-1");

    expect(result.user.id).toBe("new-staff");
    expect(result.temporaryPassword).toBeTruthy();
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "faculty@example.com",
          role: Role.FACULTY_ADVISER,
          mustResetPassword: true,
        }),
      })
    );
  });
});

describe("listUsers", () => {
  it("applies default pagination and excludes soft-deleted users", async () => {
    prismaMock.user.findMany.mockResolvedValue([baseUser() as never]);
    prismaMock.user.count.mockResolvedValue(1);

    const result = await listUsers();

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.total).toBe(1);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } })
    );
  });

  it("filters by role, isActive, and search when provided", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    await listUsers({
      role: Role.SUPER_ADMIN,
      isActive: true,
      search: "admin",
      page: 2,
      pageSize: 10,
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          role: Role.SUPER_ADMIN,
          isActive: true,
          email: { contains: "admin", mode: "insensitive" },
        },
        skip: 10,
        take: 10,
      })
    );
  });
});

describe("getUserProfile", () => {
  it("returns null when the user doesn't exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await getUserProfile("missing")).toBeNull();
  });

  it("returns null for a soft-deleted user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser({ deletedAt: new Date() }) as never);
    expect(await getUserProfile("user-1")).toBeNull();
  });

  it("returns the profile including studentProfile when present", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...baseUser(),
      studentProfile: { studentNumber: "2021-00001" },
    } as never);

    const profile = await getUserProfile("user-1");

    expect(profile?.studentProfile).toEqual({ studentNumber: "2021-00001" });
  });
});

describe("assertCanAccessStudent", () => {
  const studentProfile = {
    userId: "student-owner",
    classGroupId: "class-group-1",
    semesterId: "semester-1",
  };

  it("allows SUPER_ADMIN without a lookup", async () => {
    await expect(
      assertCanAccessStudent({ id: "admin-1", role: Role.SUPER_ADMIN }, "profile-1")
    ).resolves.toBeUndefined();
    expect(prismaMock.studentProfile.findUnique).not.toHaveBeenCalled();
  });

  it("allows DEPARTMENT_COORDINATOR without a lookup", async () => {
    await expect(
      assertCanAccessStudent({ id: "coord-1", role: Role.DEPARTMENT_COORDINATOR }, "profile-1")
    ).resolves.toBeUndefined();
    expect(prismaMock.studentProfile.findUnique).not.toHaveBeenCalled();
  });

  it("throws ForbiddenError if the student profile doesn't exist", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(null);

    await expect(
      assertCanAccessStudent({ id: "student-owner", role: Role.STUDENT_INTERN }, "missing")
    ).rejects.toThrow(ForbiddenError);
  });

  it("allows a STUDENT_INTERN to access their own profile", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(studentProfile as never);

    await expect(
      assertCanAccessStudent({ id: "student-owner", role: Role.STUDENT_INTERN }, "profile-1")
    ).resolves.toBeUndefined();
  });

  it("blocks a STUDENT_INTERN from accessing another student's profile (the PRD's named acceptance case)", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(studentProfile as never);

    await expect(
      assertCanAccessStudent({ id: "some-other-student", role: Role.STUDENT_INTERN }, "profile-1")
    ).rejects.toThrow(ForbiddenError);
  });

  it("allows a FACULTY_ADVISER linked via faculty_class_groups", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(studentProfile as never);
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue({ id: "link-1" } as never);

    await expect(
      assertCanAccessStudent({ id: "faculty-1", role: Role.FACULTY_ADVISER }, "profile-1")
    ).resolves.toBeUndefined();
    expect(prismaMock.facultyClassGroup.findFirst).toHaveBeenCalledWith({
      where: { facultyId: "faculty-1", classGroupId: "class-group-1", semesterId: "semester-1" },
      select: { id: true },
    });
  });

  it("blocks a FACULTY_ADVISER with no junction-table link to the student's class group", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(studentProfile as never);
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue(null);

    await expect(
      assertCanAccessStudent({ id: "unrelated-faculty", role: Role.FACULTY_ADVISER }, "profile-1")
    ).rejects.toThrow(ForbiddenError);
  });
});
