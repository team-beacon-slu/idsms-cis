jest.mock("@/lib/services/notificationEvents", () => ({ notifyConductRecordIssued: jest.fn() }));
jest.mock("@/lib/services/attendanceService", () => ({ computeTotalHoursRendered: jest.fn() }));
jest.mock("@/lib/services/weeklyReportService", () => ({ refreshWeeklyTotalsFrom: jest.fn() }));

import { Role } from "@prisma/client";
import { ZodError } from "zod";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { ForbiddenError } from "@/lib/services/userService";
import { notifyConductRecordIssued } from "@/lib/services/notificationEvents";
import { computeTotalHoursRendered } from "@/lib/services/attendanceService";
import { refreshWeeklyTotalsFrom } from "@/lib/services/weeklyReportService";
import {
  ConductStateError,
  issueConductRecord,
  revokeConductRecord,
} from "@/lib/services/conductService";

const faculty = { id: "faculty-1", role: Role.FACULTY_ADVISER };
const student = { id: "student-1", role: Role.STUDENT_INTERN };
const input = {
  categoryKey: "DEMERIT",
  weight: 1,
  date: "2026-10-06",
  reason: "Left the site without notice",
};

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(notifyConductRecordIssued).mockReset();
  jest.mocked(computeTotalHoursRendered).mockReset();
  // assigned adviser
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    userId: "student-1",
    classGroupId: "cg-1",
    semesterId: "s-1",
  } as never);
  prismaMock.facultyClassGroup.findFirst.mockResolvedValue({ id: "fcg-1" } as never);
  prismaMock.systemConfig.findUnique.mockResolvedValue(null); // SLU default matrix, 0 h default
  prismaMock.conductRecord.create.mockResolvedValue({ id: "cr-1" } as never);
  prismaMock.conductRecord.updateMany.mockResolvedValue({ count: 1 } as never);
});

describe("issueConductRecord", () => {
  it("records a demerit with the default hours, audits it and notifies after commit", async () => {
    await expect(issueConductRecord("profile-1", input, faculty)).resolves.toEqual({ id: "cr-1" });
    expect(prismaMock.conductRecord.create).toHaveBeenCalledWith({
      data: {
        studentProfileId: "profile-1",
        categoryKey: "DEMERIT",
        weight: 1,
        date: new Date("2026-10-06T00:00:00Z"),
        reason: "Left the site without notice",
        hoursDeducted: 0,
        issuedById: "faculty-1",
      },
      select: { id: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONDUCT_RECORD_ISSUED" }),
      })
    );
    expect(notifyConductRecordIssued).toHaveBeenCalledWith("profile-1", "Demerits", input.reason);
    expect(computeTotalHoursRendered).not.toHaveBeenCalled(); // no hours deducted
  });

  it("refreshes rendered hours when the record deducts hours", async () => {
    await issueConductRecord("profile-1", { ...input, hoursDeducted: 2 }, faculty);
    expect(computeTotalHoursRendered).toHaveBeenCalledWith("profile-1");
    expect(refreshWeeklyTotalsFrom).toHaveBeenCalledWith("profile-1", expect.any(Date));
  });

  it("refuses automatic or unknown categories", async () => {
    await expect(
      issueConductRecord("profile-1", { ...input, categoryKey: "LATE_WWR" }, faculty)
    ).rejects.toThrow(ZodError);
    await expect(
      issueConductRecord("profile-1", { ...input, categoryKey: "NOPE" }, faculty)
    ).rejects.toThrow(ZodError);
  });

  it("refuses students and unassigned advisers", async () => {
    await expect(issueConductRecord("profile-1", input, student)).rejects.toThrow(ForbiddenError);
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue(null);
    await expect(issueConductRecord("profile-1", input, faculty)).rejects.toThrow(ForbiddenError);
    expect(prismaMock.conductRecord.create).not.toHaveBeenCalled();
  });

  it("validates the reason, weight and hours", async () => {
    const bad = (over: object) => issueConductRecord("profile-1", { ...input, ...over }, faculty);
    await expect(bad({ reason: "short" })).rejects.toThrow(ZodError);
    await expect(bad({ weight: 3 })).rejects.toThrow(ZodError);
    await expect(bad({ hoursDeducted: 41 })).rejects.toThrow(ZodError);
  });
});

describe("revokeConductRecord", () => {
  beforeEach(() => {
    prismaMock.conductRecord.findUniqueOrThrow.mockResolvedValue({
      studentProfileId: "profile-1",
      hoursDeducted: 0,
    } as never);
  });

  it("revokes with a reason (guarded) and audits", async () => {
    await revokeConductRecord("cr-1", "Issued to the wrong student", faculty);
    expect(prismaMock.conductRecord.updateMany).toHaveBeenCalledWith({
      where: { id: "cr-1", revokedAt: null },
      data: expect.objectContaining({
        revokedById: "faculty-1",
        revokeReason: "Issued to the wrong student",
        revokedAt: expect.any(Date),
      }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONDUCT_RECORD_REVOKED" }),
      })
    );
  });

  it("refuses a second revoke", async () => {
    prismaMock.conductRecord.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(
      revokeConductRecord("cr-1", "Issued to the wrong student", faculty)
    ).rejects.toThrow(ConductStateError);
  });

  it("requires a reason", async () => {
    await expect(revokeConductRecord("cr-1", "no", faculty)).rejects.toThrow(ZodError);
  });
});
