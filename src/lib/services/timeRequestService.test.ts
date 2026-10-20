jest.mock("@/lib/services/notificationEvents", () => ({ notifyTimeRequestReviewed: jest.fn() }));
jest.mock("@/lib/services/weeklyReportService", () => ({ recomputeCreditedHours: jest.fn() }));

import { DeviationType, Role, ValidationStatus } from "@prisma/client";
import { ZodError } from "zod";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { ForbiddenError } from "@/lib/services/userService";
import { notifyTimeRequestReviewed } from "@/lib/services/notificationEvents";
import { recomputeCreditedHours } from "@/lib/services/weeklyReportService";
import {
  createTimeRequest,
  isFiledAfterTheFact,
  listTimeRequests,
  reviewTimeRequest,
  TimeRequestStateError,
  updateTimeRequest,
} from "@/lib/services/timeRequestService";

const student = { id: "student-1", role: Role.STUDENT_INTERN };
const faculty = { id: "faculty-1", role: Role.FACULTY_ADVISER };
const otInput = {
  deviationType: "OVERTIME",
  requestKind: "ANTICIPATED",
  date: "2026-10-10",
  startTime: "08:00",
  endTime: "12:00",
  reason: "Release weekend requested by supervisor",
};

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(notifyTimeRequestReviewed).mockReset();
  jest.mocked(recomputeCreditedHours).mockReset();
  prismaMock.deviationReport.updateMany.mockResolvedValue({ count: 1 } as never);
});

describe("races and post-commit failures", () => {
  it("an edit that loses a race with an approval is refused, not overwritten", async () => {
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue({
      id: "tr-1",
      validationStatus: ValidationStatus.PENDING,
      studentProfile: { userId: "student-1" },
    } as never);
    prismaMock.deviationReport.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(updateTimeRequest("tr-1", otInput, student)).rejects.toThrow(
      TimeRequestStateError
    );
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("a review that loses a race is refused", async () => {
    ownProfile("student-1");
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue({ id: "fcg-1" } as never);
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue({
      id: "tr-1",
      studentProfileId: "profile-1",
      deviationType: DeviationType.OVERTIME,
      date: new Date("2026-10-10T00:00:00Z"),
      endDate: null,
      validationStatus: ValidationStatus.PENDING,
    } as never);
    prismaMock.deviationReport.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(reviewTimeRequest("tr-1", "APPROVE", undefined, faculty)).rejects.toThrow(
      TimeRequestStateError
    );
    expect(recomputeCreditedHours).not.toHaveBeenCalled();
  });

  it("a recompute failure after commit still reports the saved review and notifies", async () => {
    ownProfile("student-1");
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue({ id: "fcg-1" } as never);
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue({
      id: "tr-1",
      studentProfileId: "profile-1",
      deviationType: DeviationType.OVERTIME,
      date: new Date("2026-10-10T00:00:00Z"),
      endDate: null,
      validationStatus: ValidationStatus.PENDING,
    } as never);
    jest.mocked(recomputeCreditedHours).mockRejectedValue(new Error("db blip"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(reviewTimeRequest("tr-1", "APPROVE", undefined, faculty)).resolves.toEqual(
      expect.objectContaining({ status: ValidationStatus.VALIDATED })
    );
    expect(notifyTimeRequestReviewed).toHaveBeenCalled();
  });
});

function ownProfile(userId = "student-1") {
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    userId,
    classGroupId: "cg-1",
    semesterId: "sem-1",
  } as never);
}

describe("createTimeRequest", () => {
  it("creates a pending request with derived minutes and audits it", async () => {
    ownProfile();
    prismaMock.deviationReport.create.mockResolvedValue({ id: "tr-1" } as never);

    await expect(createTimeRequest("profile-1", otInput, student)).resolves.toEqual({ id: "tr-1" });

    expect(prismaMock.deviationReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentProfileId: "profile-1",
        deviationType: DeviationType.OVERTIME,
        requestKind: "ANTICIPATED",
        date: new Date("2026-10-10T00:00:00Z"),
        startTime: "08:00",
        endTime: "12:00",
        requestedMinutes: 240,
        proofType: null,
        submittedAt: expect.any(Date),
      }),
      select: { id: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "TIME_REQUEST_SUBMITTED", entityId: "tr-1" }),
      })
    );
  });

  it("only the owning student can file", async () => {
    ownProfile("someone-else");
    await expect(createTimeRequest("profile-1", otInput, student)).rejects.toThrow(ForbiddenError);
    await expect(createTimeRequest("profile-1", otInput, faculty)).rejects.toThrow(ForbiddenError);
    expect(prismaMock.deviationReport.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input", async () => {
    ownProfile();
    await expect(
      createTimeRequest("profile-1", { ...otInput, startTime: undefined }, student)
    ).rejects.toThrow(ZodError);
  });
});

describe("updateTimeRequest", () => {
  function existing(validationStatus: ValidationStatus, userId = "student-1") {
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue({
      id: "tr-1",
      validationStatus,
      studentProfile: { userId },
    } as never);
  }

  it("resubmits a returned request as pending and clears the note", async () => {
    existing(ValidationStatus.REJECTED);
    await updateTimeRequest("tr-1", otInput, student);
    expect(prismaMock.deviationReport.updateMany).toHaveBeenCalledWith({
      where: { id: "tr-1", validationStatus: { not: ValidationStatus.VALIDATED } },
      data: expect.objectContaining({
        validationStatus: ValidationStatus.PENDING,
        reviewNote: null,
        facultyId: null,
        requestedMinutes: 240,
        updatedAt: expect.any(Date),
      }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "TIME_REQUEST_RESUBMITTED" }),
      })
    );
  });

  it("refuses an approved request", async () => {
    existing(ValidationStatus.VALIDATED);
    await expect(updateTimeRequest("tr-1", otInput, student)).rejects.toThrow(
      TimeRequestStateError
    );
  });

  it("refuses anyone but the owner", async () => {
    existing(ValidationStatus.PENDING, "student-2");
    await expect(updateTimeRequest("tr-1", otInput, student)).rejects.toThrow(ForbiddenError);
  });
});

describe("reviewTimeRequest", () => {
  const otRow = {
    id: "tr-1",
    studentProfileId: "profile-1",
    deviationType: DeviationType.OVERTIME,
    date: new Date("2026-10-10T00:00:00Z"),
    endDate: null,
    validationStatus: ValidationStatus.PENDING,
  };

  function assigned() {
    ownProfile("student-1");
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue({ id: "fcg-1" } as never);
  }

  it("approves, audits, recomputes the request's dates and notifies after commit", async () => {
    assigned();
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue(otRow as never);

    await expect(reviewTimeRequest("tr-1", "APPROVE", undefined, faculty)).resolves.toEqual({
      studentProfileId: "profile-1",
      status: ValidationStatus.VALIDATED,
    });

    expect(prismaMock.deviationReport.updateMany).toHaveBeenCalledWith({
      where: { id: "tr-1", validationStatus: { in: [ValidationStatus.PENDING] } },
      data: {
        validationStatus: ValidationStatus.VALIDATED,
        facultyId: "faculty-1",
        reviewNote: null,
      },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "TIME_REQUEST_APPROVED" }),
      })
    );
    expect(recomputeCreditedHours).toHaveBeenCalledWith("profile-1", { dates: [otRow.date] });
    expect(notifyTimeRequestReviewed).toHaveBeenCalledWith(
      "profile-1",
      "APPROVE",
      otRow,
      undefined
    );
  });

  it("returns with a note and recomputes (revoking credited OT)", async () => {
    assigned();
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue({
      ...otRow,
      validationStatus: ValidationStatus.VALIDATED,
    } as never);

    await reviewTimeRequest("tr-1", "RETURN", "Ask your supervisor to sign first", faculty);

    expect(prismaMock.deviationReport.updateMany).toHaveBeenCalledWith({
      where: {
        id: "tr-1",
        validationStatus: { in: [ValidationStatus.PENDING, ValidationStatus.VALIDATED] },
      },
      data: {
        validationStatus: ValidationStatus.REJECTED,
        facultyId: "faculty-1",
        reviewNote: "Ask your supervisor to sign first",
      },
    });
    expect(recomputeCreditedHours).toHaveBeenCalled();
  });

  it("requires a note to return", async () => {
    await expect(reviewTimeRequest("tr-1", "RETURN", "  ", faculty)).rejects.toThrow(ZodError);
    expect(prismaMock.deviationReport.updateMany).not.toHaveBeenCalled();
  });

  it("does not recompute for a non-overtime request", async () => {
    assigned();
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue({
      ...otRow,
      deviationType: DeviationType.UNDERTIME,
    } as never);
    await reviewTimeRequest("tr-1", "APPROVE", undefined, faculty);
    expect(recomputeCreditedHours).not.toHaveBeenCalled();
  });

  it("refuses an unassigned adviser and students", async () => {
    ownProfile("student-1");
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue(null);
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue(otRow as never);
    await expect(reviewTimeRequest("tr-1", "APPROVE", undefined, faculty)).rejects.toThrow(
      ForbiddenError
    );
    await expect(reviewTimeRequest("tr-1", "APPROVE", undefined, student)).rejects.toThrow(
      ForbiddenError
    );
    expect(prismaMock.deviationReport.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to approve twice", async () => {
    assigned();
    prismaMock.deviationReport.findUniqueOrThrow.mockResolvedValue({
      ...otRow,
      validationStatus: ValidationStatus.VALIDATED,
    } as never);
    await expect(reviewTimeRequest("tr-1", "APPROVE", undefined, faculty)).rejects.toThrow(
      TimeRequestStateError
    );
  });
});

describe("isFiledAfterTheFact", () => {
  const date = new Date("2026-10-10T00:00:00Z");
  it("flags overtime filed on a later Manila day", () => {
    // 2026-10-10 16:30Z is 2026-10-11 00:30 in Manila
    expect(
      isFiledAfterTheFact({
        deviationType: "OVERTIME",
        date,
        submittedAt: new Date("2026-10-10T16:30:00Z"),
      })
    ).toBe(true);
    expect(
      isFiledAfterTheFact({
        deviationType: "OVERTIME",
        date,
        submittedAt: new Date("2026-10-10T15:30:00Z"),
      })
    ).toBe(false);
  });
  it("never flags other types or legacy rows", () => {
    expect(
      isFiledAfterTheFact({
        deviationType: "UNDERTIME",
        date,
        submittedAt: new Date("2026-10-12T00:00:00Z"),
      })
    ).toBe(false);
    expect(isFiledAfterTheFact({ deviationType: "OVERTIME", date, submittedAt: null })).toBe(false);
  });
});

describe("listTimeRequests", () => {
  it("adds the after-the-fact flag", async () => {
    prismaMock.deviationReport.findMany.mockResolvedValue([
      {
        id: "tr-1",
        deviationType: "OVERTIME",
        date: new Date("2026-10-10T00:00:00Z"),
        submittedAt: new Date("2026-10-12T00:00:00Z"),
      },
    ] as never);
    const [row] = await listTimeRequests("profile-1");
    expect(row.filedAfterTheFact).toBe(true);
  });
});
