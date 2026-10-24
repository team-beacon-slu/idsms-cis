jest.mock("@/lib/services/notifications/notificationEvents", () => ({
  notifyDeductionDisputed: jest.fn(),
  notifyDisputeResolved: jest.fn(),
}));
jest.mock("@/lib/services/conduct/deductionService", () => {
  class ConductStateError extends Error {}
  return {
    ConductStateError,
    assertStaffFor: jest.fn(),
    listAutomaticItems: jest.fn(),
  };
});

import { Prisma, Role } from "@prisma/client";
import { ZodError } from "zod";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import {
  assertStaffFor,
  ConductStateError,
  listAutomaticItems,
} from "@/lib/services/conduct/deductionService";
import {
  notifyDeductionDisputed,
  notifyDisputeResolved,
} from "@/lib/services/notifications/notificationEvents";
import { declineDispute, disputeDeduction } from "@/lib/services/conduct/disputeService";

const student = { id: "student-1", role: Role.STUDENT_INTERN };
const faculty = { id: "faculty-1", role: Role.FACULTY_ADVISER };
const now = new Date("2026-10-20T00:00:00Z");
const lateWeek = {
  itemType: "LATE_WWR",
  itemKey: "2026-10-05",
  date: new Date("2026-10-05T00:00:00Z"),
  detail: "Weekly report for Oct 5, 2026 submitted late",
  unjustified: false,
  excused: null,
};
const dispute = {
  itemType: "LATE_WWR",
  itemKey: "2026-10-05",
  reason: "I submitted on time but the site was down",
};

beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  // The intern owns profile-1.
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    userId: "student-1",
    classGroupId: "cg-1",
    semesterId: "s-1",
  } as never);
  jest.mocked(listAutomaticItems).mockResolvedValue([lateWeek] as never);
  prismaMock.deductionDispute.create.mockResolvedValue({ id: "dp-1" } as never);
});

describe("disputeDeduction", () => {
  it("records the intern's dispute, audits it and tells the advisers", async () => {
    await expect(disputeDeduction("profile-1", dispute, student, null, now)).resolves.toEqual({
      id: "dp-1",
    });
    expect(prismaMock.deductionDispute.create).toHaveBeenCalledWith({
      data: { studentProfileId: "profile-1", ...dispute },
      select: { id: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DEDUCTION_DISPUTED" }) })
    );
    expect(notifyDeductionDisputed).toHaveBeenCalledWith("profile-1", lateWeek.detail);
  });

  it("matches a missing week to its late item (same family)", async () => {
    await disputeDeduction(
      "profile-1",
      { ...dispute, itemType: "MISSING_WWR" },
      student,
      null,
      now
    );
    expect(prismaMock.deductionDispute.create).toHaveBeenCalled();
  });

  it("only lets the intern dispute, and only their own record", async () => {
    await expect(disputeDeduction("profile-1", dispute, faculty, null, now)).rejects.toThrow(
      ForbiddenError
    );
    await expect(
      disputeDeduction("profile-1", dispute, { id: "other", role: Role.STUDENT_INTERN }, null, now)
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses an item that no longer counts: excused, absent or a revoked record", async () => {
    jest
      .mocked(listAutomaticItems)
      .mockResolvedValue([{ ...lateWeek, excused: { id: "ex-1" } }] as never);
    await expect(disputeDeduction("profile-1", dispute, student, null, now)).rejects.toThrow(
      ConductStateError
    );
    prismaMock.conductRecord.findFirst.mockResolvedValue(null);
    await expect(
      disputeDeduction("profile-1", { ...dispute, itemType: "CONDUCT", itemKey: "cr-1" }, student)
    ).rejects.toThrow(ConductStateError);
    expect(prismaMock.conductRecord.findFirst).toHaveBeenCalledWith({
      where: { id: "cr-1", studentProfileId: "profile-1", revokedAt: null },
      select: { reason: true },
    });
  });

  it("needs a real reason", async () => {
    await expect(
      disputeDeduction("profile-1", { ...dispute, reason: "unfair" }, student, null, now)
    ).rejects.toThrow(ZodError);
  });

  it("maps a second open dispute on the item to a 409 state error", async () => {
    prismaMock.deductionDispute.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" })
    );
    await expect(disputeDeduction("profile-1", dispute, student, null, now)).rejects.toThrow(
      ConductStateError
    );
    expect(notifyDeductionDisputed).not.toHaveBeenCalled();
  });
});

describe("declineDispute", () => {
  beforeEach(() => {
    prismaMock.deductionDispute.findUniqueOrThrow.mockResolvedValue({
      studentProfileId: "profile-1",
      itemType: "LATE_WWR",
      itemKey: "2026-10-05",
    } as never);
    prismaMock.deductionDispute.updateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("keeps the deduction with a note, guarded, audited, and tells the intern", async () => {
    await declineDispute("dp-1", "The portal log shows no upload that week", faculty);
    expect(assertStaffFor).toHaveBeenCalledWith(faculty, "profile-1");
    expect(prismaMock.deductionDispute.updateMany).toHaveBeenCalledWith({
      where: { id: "dp-1", resolvedAt: null },
      data: expect.objectContaining({
        outcome: "DECLINED",
        resolvedById: "faculty-1",
        resolutionNote: "The portal log shows no upload that week",
      }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DEDUCTION_DISPUTE_DECLINED" }),
      })
    );
    expect(notifyDisputeResolved).toHaveBeenCalledWith(
      "profile-1",
      "Weekly report for the week of 2026-10-05",
      "DECLINED",
      "The portal log shows no upload that week"
    );
  });

  it("refuses a dispute already answered, and a missing note", async () => {
    prismaMock.deductionDispute.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(declineDispute("dp-1", "Already looked at this", faculty)).rejects.toThrow(
      ConductStateError
    );
    await expect(declineDispute("dp-1", "", faculty)).rejects.toThrow(ZodError);
    expect(notifyDisputeResolved).not.toHaveBeenCalled();
  });
});
