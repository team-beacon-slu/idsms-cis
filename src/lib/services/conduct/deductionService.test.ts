jest.mock("@/lib/services/notifications/notificationEvents", () => ({
  notifyDisputeResolved: jest.fn(),
}));

import { Prisma, Role } from "@prisma/client";
import { ZodError } from "zod";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { DEFAULT_MATRIX } from "@/lib/utils/deductionMatrix";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import { notifyDisputeResolved } from "@/lib/services/notifications/notificationEvents";
import {
  ConductStateError,
  excuseItem,
  getDeductionTally,
  getDeductionTallies,
  listAutomaticItems,
  withdrawExcuse,
  getDefaultConductHours,
  getDeductionMatrix,
  setDeductionMatrix,
  setDefaultConductHours,
} from "@/lib/services/conduct/deductionService";

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(notifyDisputeResolved).mockReset();
});

describe("deduction matrix config", () => {
  it("falls back to SLU's defaults when unset or invalid", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    await expect(getDeductionMatrix()).resolves.toEqual(DEFAULT_MATRIX);
    prismaMock.systemConfig.findUnique.mockResolvedValue({ configValue: [{ bad: true }] } as never);
    await expect(getDeductionMatrix()).resolves.toEqual(DEFAULT_MATRIX);
  });

  it("returns the stored matrix", async () => {
    const edited = DEFAULT_MATRIX.map((c) =>
      c.key === "DEMERIT" ? { ...c, tiers: [{ count: 1, adviser: 1, wwr: 1 }] } : c
    );
    prismaMock.systemConfig.findUnique.mockResolvedValue({ configValue: edited } as never);
    await expect(getDeductionMatrix()).resolves.toEqual(edited);
  });

  it("validates, stores and audits an edit", async () => {
    prismaMock.systemConfig.upsert.mockResolvedValue({ id: "cfg-1" } as never);
    await setDeductionMatrix(DEFAULT_MATRIX, "admin-1");
    expect(prismaMock.systemConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { configKey: "deduction_matrix" } })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DEDUCTION_MATRIX_UPDATED" }),
      })
    );
    await expect(setDeductionMatrix([{ key: "x" }], "admin-1")).rejects.toThrow(ZodError);
  });
});

describe("automatic items and excuses", () => {
  const faculty = { id: "faculty-1", role: Role.FACULTY_ADVISER };
  const missingWeek = {
    id: "wr-1",
    studentProfileId: "profile-1",
    weekStart: new Date("2026-10-05T00:00:00Z"),
    weekEnd: new Date("2026-10-11T00:00:00Z"),
    revisionHistory: [],
    dailyEntries: [],
  };

  beforeEach(() => {
    prismaMock.studentProfile.findUnique.mockResolvedValue({
      userId: "student-1",
      classGroupId: "cg-1",
      semesterId: "s-1",
    } as never);
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue({ id: "fcg-1" } as never);
    prismaMock.workPlan.findMany.mockResolvedValue([] as never);
    prismaMock.studentProfile.findMany.mockResolvedValue([
      { id: "profile-1", semester: null },
    ] as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([missingWeek] as never);
    prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
    prismaMock.deductionException.findMany.mockResolvedValue([] as never);
    prismaMock.deductionException.create.mockResolvedValue({ id: "ex-1" } as never);
    prismaMock.deductionException.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.deductionDispute.updateMany.mockResolvedValue({ count: 0 } as never);
  });

  it("an excuse accepts the intern's open dispute on the same week, and tells them", async () => {
    prismaMock.deductionDispute.updateMany.mockResolvedValue({ count: 1 } as never);
    await excuseItem("profile-1", excuse, faculty, null, now);
    expect(prismaMock.deductionDispute.updateMany).toHaveBeenCalledWith({
      where: {
        studentProfileId: "profile-1",
        itemType: { in: ["LATE_WWR", "MISSING_WWR"] },
        itemKey: "2026-10-05",
        resolvedAt: null,
      },
      data: expect.objectContaining({ outcome: "ACCEPTED", resolvedById: "faculty-1" }),
    });
    expect(notifyDisputeResolved).toHaveBeenCalledWith(
      "profile-1",
      expect.any(String),
      "ACCEPTED",
      excuse.note
    );
  });

  it("an excuse with no open dispute notifies no one", async () => {
    await excuseItem("profile-1", excuse, faculty, null, now);
    expect(notifyDisputeResolved).not.toHaveBeenCalled();
  });

  const now = new Date("2026-10-20T00:00:00Z");
  const excuse = {
    itemType: "MISSING_WWR",
    itemKey: "2026-10-05",
    reasonCode: "BEYOND_INTERN_CONTROL",
    note: "Site closed by the typhoon all week",
  };

  it("lists automatic items with their active excuse", async () => {
    prismaMock.deductionException.findMany.mockResolvedValue([
      {
        id: "ex-1",
        studentProfileId: "profile-1",
        itemType: "MISSING_WWR",
        itemKey: "2026-10-05",
        reasonCode: "BEYOND_INTERN_CONTROL",
        note: "x",
      },
    ] as never);
    const [item] = await listAutomaticItems("profile-1", now);
    expect(item).toEqual(
      expect.objectContaining({
        itemType: "MISSING_WWR",
        itemKey: "2026-10-05",
        excused: expect.objectContaining({ id: "ex-1" }),
      })
    );
  });

  it("excuses an existing item, audited", async () => {
    await expect(excuseItem("profile-1", excuse, faculty, null, now)).resolves.toEqual({
      id: "ex-1",
    });
    expect(prismaMock.deductionException.create).toHaveBeenCalledWith({
      data: { studentProfileId: "profile-1", ...excuse, createdById: "faculty-1" },
      select: { id: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DEDUCTION_EXCUSED" }) })
    );
  });

  it("refuses an item that doesn't exist, a bad reason code and a short note", async () => {
    await expect(
      excuseItem("profile-1", { ...excuse, itemKey: "2026-09-28" }, faculty, null, now)
    ).rejects.toThrow(ZodError);
    await expect(
      excuseItem("profile-1", { ...excuse, reasonCode: "OTHER" }, faculty, null, now)
    ).rejects.toThrow(ZodError);
    await expect(
      excuseItem("profile-1", { ...excuse, note: "short" }, faculty, null, now)
    ).rejects.toThrow(ZodError);
  });

  it("maps a second active excuse to a 409 state error", async () => {
    prismaMock.deductionException.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" })
    );
    await expect(excuseItem("profile-1", excuse, faculty, null, now)).rejects.toThrow(
      ConductStateError
    );
  });

  it("withdraws once, audited", async () => {
    prismaMock.deductionException.findUniqueOrThrow.mockResolvedValue({
      studentProfileId: "profile-1",
    } as never);
    await withdrawExcuse("ex-1", faculty);
    expect(prismaMock.deductionException.updateMany).toHaveBeenCalledWith({
      where: { id: "ex-1", withdrawnAt: null },
      data: { withdrawnAt: expect.any(Date), withdrawnById: "faculty-1" },
    });
    prismaMock.deductionException.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(withdrawExcuse("ex-1", faculty)).rejects.toThrow(ConductStateError);
  });

  it("tallies active records and non-excused items", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    prismaMock.conductRecord.findMany.mockResolvedValue([
      { studentProfileId: "profile-1", categoryKey: "DEMERIT", weight: 1 },
    ] as never);
    const tally = await getDeductionTally("profile-1", now);
    expect(prismaMock.conductRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentProfileId: { in: ["profile-1"] }, revokedAt: null },
      })
    );
    // demerit 3/3 + one missing (unjustified) WWR 3/5 + 2/2
    expect(tally.totals).toEqual({ adviser: 8, wwr: 10 });

    prismaMock.deductionException.findMany.mockResolvedValue([
      {
        id: "ex-1",
        studentProfileId: "profile-1",
        itemType: "MISSING_WWR",
        itemKey: "2026-10-05",
        reasonCode: "BEYOND_INTERN_CONTROL",
        note: "x",
      },
    ] as never);
    expect((await getDeductionTally("profile-1", now)).totals).toEqual({ adviser: 3, wwr: 3 });
  });

  it("tallies many interns in one query per table, keeping each intern's records apart", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    prismaMock.studentProfile.findMany.mockResolvedValue([
      { id: "profile-1", semester: null },
      { id: "profile-2", semester: null },
    ] as never);
    prismaMock.conductRecord.findMany.mockResolvedValue([
      { studentProfileId: "profile-1", categoryKey: "DEMERIT", weight: 1 },
    ] as never);
    const tallies = await getDeductionTallies(["profile-1", "profile-2"], now);
    // profile-1: demerit + the missing week; profile-2: nothing on record.
    expect(tallies.get("profile-1")?.totals).toEqual({ adviser: 8, wwr: 10 });
    expect(tallies.get("profile-2")?.totals).toEqual({ adviser: 0, wwr: 0 });
    expect(prismaMock.conductRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledTimes(1);
  });

  it("refuses students", async () => {
    await expect(
      excuseItem("profile-1", excuse, { id: "student-1", role: Role.STUDENT_INTERN }, null, now)
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("default hours per conduct record", () => {
  it("defaults to 0 and stores 0–40", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    await expect(getDefaultConductHours()).resolves.toBe(0);
    prismaMock.systemConfig.upsert.mockResolvedValue({ id: "cfg-2" } as never);
    await setDefaultConductHours(4, "admin-1");
    expect(prismaMock.systemConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ configValue: 4 }) })
    );
    await expect(setDefaultConductHours(41, "admin-1")).rejects.toThrow(ZodError);
  });
});
