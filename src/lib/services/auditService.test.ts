import { Prisma } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { logEvent } from "@/lib/services/auditService";

beforeEach(() => {
  resetPrismaMock();
});

describe("logEvent", () => {
  it("writes all fields, defaulting optional ones to null", async () => {
    await logEvent({ userId: "user-1", action: "LOGIN_SUCCESS", entityType: "User" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        action: "LOGIN_SUCCESS",
        entityType: "User",
        entityId: null,
        ipAddress: null,
        detail: Prisma.JsonNull,
      },
    });
  });

  it("passes through entityId, ipAddress, and detail when given", async () => {
    await logEvent({
      userId: "user-1",
      action: "ACCOUNT_LOCKED",
      entityType: "User",
      entityId: "user-1",
      ipAddress: "127.0.0.1",
      detail: { failedAttempts: 5 },
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        action: "ACCOUNT_LOCKED",
        entityType: "User",
        entityId: "user-1",
        ipAddress: "127.0.0.1",
        detail: { failedAttempts: 5 },
      },
    });
  });

  it("writes through a passed transaction client instead of the default singleton", async () => {
    const txClient = { auditLog: { create: jest.fn() } };

    await logEvent(
      { userId: "user-1", action: "LOGIN_SUCCESS", entityType: "User" },
      txClient as never
    );

    expect(txClient.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});
