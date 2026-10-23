jest.mock("@/lib/services/notifications/notificationEvents", () => ({
  notifyFinalReportSubmitted: jest.fn(),
  notifyFinalReportReviewed: jest.fn(),
}));
jest.mock("@/lib/services/attendance/attendanceService", () => ({
  calculateRenderedHours: jest.fn(),
  getFinalReportThreshold: jest.fn(),
}));

import { Prisma, Role } from "@prisma/client";
import { ZodError } from "zod";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { FinalReportLockedError, FinalReportStateError } from "@/lib/documents/errors";
import {
  calculateRenderedHours,
  getFinalReportThreshold,
} from "@/lib/services/attendance/attendanceService";
import {
  notifyFinalReportReviewed,
  notifyFinalReportSubmitted,
} from "@/lib/services/notifications/notificationEvents";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import {
  getFinalReportState,
  reviewFinalReport,
  saveFinalReportDraft,
  submitFinalReport,
} from "@/lib/services/reports/finalReportService";
import { ATTACHMENT_KEYS, SECTION_KEYS } from "@/lib/validators/finalReport";

const student = { id: "student-1", role: Role.STUDENT_INTERN };
const coordinator = { id: "coord-1", role: Role.DEPARTMENT_COORDINATOR };
const faculty = { id: "faculty-1", role: Role.FACULTY_ADVISER };

const complete = {
  id: "fr-1",
  studentProfileId: "profile-1",
  status: "DRAFT",
  sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, `Text ${k}`])),
  supervisorScore: 4.5,
  supervisorScale: 5,
  peerScore: 90,
  peerScale: 100,
  attachments: Object.fromEntries(
    ATTACHMENT_KEYS.map((k) => [k, { attached: true, confirmed: false }])
  ),
};

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(notifyFinalReportSubmitted).mockReset();
  jest.mocked(notifyFinalReportReviewed).mockReset();
  jest.mocked(calculateRenderedHours).mockResolvedValue(500);
  jest.mocked(getFinalReportThreshold).mockResolvedValue(500);
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    userId: "student-1",
    classGroupId: "cg-1",
    semesterId: "s-1",
    program: "BSIT",
    requiredHours: 600,
  } as never);
  prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
    program: "BSIT",
    requiredHours: 600,
  } as never);
  prismaMock.finalTechnicalReport.updateMany.mockResolvedValue({ count: 1 } as never);
});

describe("gate (FR-FT-01)", () => {
  it("reports locked below the threshold and refuses a draft", async () => {
    jest.mocked(calculateRenderedHours).mockResolvedValue(480);
    prismaMock.finalTechnicalReport.findUnique.mockResolvedValue(null);
    await expect(getFinalReportState("profile-1")).resolves.toEqual(
      expect.objectContaining({ unlocked: false, renderedHours: 480, threshold: 500, report: null })
    );
    await expect(
      saveFinalReportDraft("profile-1", { sections: { introduction: "Hi" } }, student)
    ).rejects.toThrow(FinalReportLockedError);
  });
});

describe("saveFinalReportDraft", () => {
  it("creates the report on the first save, merging sections, audited", async () => {
    prismaMock.finalTechnicalReport.findUnique.mockResolvedValue(null);
    prismaMock.finalTechnicalReport.create.mockResolvedValue({ id: "fr-1" } as never);
    await saveFinalReportDraft(
      "profile-1",
      { sections: { introduction: "Hello" }, attachments: { attendanceProof: true } },
      student
    );
    expect(prismaMock.finalTechnicalReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentProfileId: "profile-1",
        sections: { introduction: "Hello" },
        attachments: { attendanceProof: { attached: true, confirmed: false } },
      }),
      select: { id: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "FINAL_REPORT_SAVED" }) })
    );
  });

  it("updates an editable report with a status guard; a submitted one is refused", async () => {
    prismaMock.finalTechnicalReport.findUnique.mockResolvedValue(complete as never);
    await saveFinalReportDraft("profile-1", { sections: { learnings: "New" } }, student);
    expect(prismaMock.finalTechnicalReport.updateMany).toHaveBeenCalledWith({
      where: { id: "fr-1", status: { in: ["DRAFT", "RETURNED"] } },
      data: expect.objectContaining({
        sections: expect.objectContaining({ learnings: "New", introduction: "Text introduction" }),
      }),
    });
    prismaMock.finalTechnicalReport.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(
      saveFinalReportDraft("profile-1", { sections: { learnings: "x" } }, student)
    ).rejects.toThrow(FinalReportStateError);
  });

  it("only the intern edits their report", async () => {
    await expect(saveFinalReportDraft("profile-1", {}, coordinator)).rejects.toThrow(
      ForbiddenError
    );
  });

  it("validates the draft", async () => {
    prismaMock.finalTechnicalReport.findUnique.mockResolvedValue(complete as never);
    await expect(
      saveFinalReportDraft("profile-1", { supervisorScore: 9, supervisorScale: 5 }, student)
    ).rejects.toThrow(ZodError);
  });
});

describe("review-fix rules", () => {
  it("keeps editing a returned report even if hours dropped below the threshold", async () => {
    jest.mocked(calculateRenderedHours).mockResolvedValue(480);
    prismaMock.finalTechnicalReport.findUnique.mockResolvedValue({
      ...complete,
      status: "RETURNED",
    } as never);
    await expect(
      saveFinalReportDraft("profile-1", { sections: { learnings: "Fixed" } }, student)
    ).resolves.toBeUndefined();
  });

  it("checks the score against the stored scale on a partial save", async () => {
    prismaMock.finalTechnicalReport.findUnique.mockResolvedValue(complete as never);
    await expect(
      saveFinalReportDraft("profile-1", { supervisorScore: 90 }, student)
    ).rejects.toThrow(/can't be above/);
  });

  it("maps two first saves racing to a 409, not a 500", async () => {
    prismaMock.finalTechnicalReport.findUnique.mockResolvedValue(null);
    prismaMock.finalTechnicalReport.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" })
    );
    await expect(
      saveFinalReportDraft("profile-1", { sections: { introduction: "Hi" } }, student)
    ).rejects.toThrow(FinalReportStateError);
  });
});

describe("submitFinalReport", () => {
  it("submits a complete report, resets attachment confirmations, and notifies coordinators", async () => {
    prismaMock.finalTechnicalReport.findUnique.mockResolvedValue({
      ...complete,
      attachments: Object.fromEntries(
        ATTACHMENT_KEYS.map((k) => [k, { attached: true, confirmed: true }])
      ),
    } as never);
    await submitFinalReport("profile-1", student);
    expect(prismaMock.finalTechnicalReport.updateMany).toHaveBeenCalledWith({
      where: { id: "fr-1", status: { in: ["DRAFT", "RETURNED"] } },
      data: {
        status: "SUBMITTED",
        submittedAt: expect.any(Date),
        reviewNote: null,
        // each review round confirms afresh
        attachments: Object.fromEntries(
          ATTACHMENT_KEYS.map((k) => [k, { attached: true, confirmed: false }])
        ),
      },
    });
    expect(notifyFinalReportSubmitted).toHaveBeenCalledWith("profile-1");
  });

  it("lists what's missing", async () => {
    prismaMock.finalTechnicalReport.findUnique.mockResolvedValue({
      ...complete,
      peerScore: null,
    } as never);
    await expect(submitFinalReport("profile-1", student)).rejects.toThrow(
      "Enter the peer evaluation score"
    );
  });
});

describe("reviewFinalReport (FR-FT-03)", () => {
  beforeEach(() => {
    prismaMock.finalTechnicalReport.findUniqueOrThrow.mockResolvedValue({
      ...complete,
      status: "SUBMITTED",
    } as never);
  });

  it("approves once every attachment is confirmed, and notifies the intern", async () => {
    await reviewFinalReport(
      "fr-1",
      { action: "APPROVE", confirmed: [...ATTACHMENT_KEYS] },
      coordinator
    );
    expect(prismaMock.finalTechnicalReport.updateMany).toHaveBeenCalledWith({
      where: { id: "fr-1", status: "SUBMITTED" },
      data: expect.objectContaining({
        status: "APPROVED",
        reviewedById: "coord-1",
        attachments: Object.fromEntries(
          ATTACHMENT_KEYS.map((k) => [k, { attached: true, confirmed: true }])
        ),
      }),
    });
    expect(notifyFinalReportReviewed).toHaveBeenCalledWith("profile-1", "APPROVE", undefined);
  });

  it("refuses to approve with an unconfirmed attachment", async () => {
    await expect(
      reviewFinalReport("fr-1", { action: "APPROVE", confirmed: ["attendanceProof"] }, coordinator)
    ).rejects.toThrow(FinalReportLockedError);
  });

  it("returns with a required note", async () => {
    await expect(reviewFinalReport("fr-1", { action: "RETURN" }, coordinator)).rejects.toThrow(
      ZodError
    );
    await reviewFinalReport(
      "fr-1",
      { action: "RETURN", note: "Expand the learnings" },
      coordinator
    );
    expect(prismaMock.finalTechnicalReport.updateMany).toHaveBeenLastCalledWith({
      where: { id: "fr-1", status: "SUBMITTED" },
      data: expect.objectContaining({ status: "RETURNED", reviewNote: "Expand the learnings" }),
    });
  });

  it("only coordinators and Super Admins review", async () => {
    await expect(
      reviewFinalReport("fr-1", { action: "APPROVE", confirmed: [] }, faculty)
    ).rejects.toThrow(ForbiddenError);
  });

  it("a report already reviewed is a 409", async () => {
    prismaMock.finalTechnicalReport.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(
      reviewFinalReport("fr-1", { action: "RETURN", note: "Expand the learnings" }, coordinator)
    ).rejects.toThrow(FinalReportStateError);
  });
});
