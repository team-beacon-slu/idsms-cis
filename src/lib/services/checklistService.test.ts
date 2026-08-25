import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  ChecklistRequirementType,
  ChecklistStatus,
  MoaStatus,
  Role,
  WorkPlanStatus,
} from "@prisma/client";
import {
  ChecklistGateError,
  ChecklistLockedError,
  getChecklistProgress,
  isEndorsementGateSatisfied,
  reviewChecklistItem,
  uploadChecklistItemFile,
} from "@/lib/services/checklistService";
import { ForbiddenError } from "@/lib/services/userService";
import { CHECKLIST_BUCKET, uploadFile } from "@/lib/storage";

jest.mock("@/lib/storage", () => ({
  CHECKLIST_BUCKET: "checklist-documents",
  uploadFile: jest.fn(),
}));

const mockedUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;

// DEPARTMENT_COORDINATOR/SUPER_ADMIN skip assertCanAccessStudent's profile
// lookup entirely (see userService.test.ts), which keeps these tests focused
// on checklistService's own logic rather than re-deriving that ownership check.
const staffUser = { id: "coordinator-1", role: Role.DEPARTMENT_COORDINATOR };

function baseItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "item-1",
    studentProfileId: "profile-1",
    requirementType: ChecklistRequirementType.MEDICAL_CERTIFICATE,
    status: ChecklistStatus.PENDING,
    filePath: null,
    reviewerId: null,
    reviewDate: null,
    comments: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetPrismaMock();
  mockedUploadFile.mockReset();
  mockedUploadFile.mockResolvedValue("profile-1/MEDICAL_CERTIFICATE.pdf");
});

describe("isEndorsementGateSatisfied", () => {
  it("is true only when all 9 items exist and are APPROVED", async () => {
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(
      Array.from({ length: 9 }, () => ({ status: ChecklistStatus.APPROVED })) as never
    );

    expect(await isEndorsementGateSatisfied("profile-1")).toBe(true);
  });

  it("is false when fewer than 9 items exist", async () => {
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue([
      { status: ChecklistStatus.APPROVED },
    ] as never);

    expect(await isEndorsementGateSatisfied("profile-1")).toBe(false);
  });

  it("is false when any of the 9 items is not APPROVED", async () => {
    const items: { status: ChecklistStatus }[] = Array.from({ length: 9 }, () => ({
      status: ChecklistStatus.APPROVED,
    }));
    items[0] = { status: ChecklistStatus.PENDING };
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(items as never);

    expect(await isEndorsementGateSatisfied("profile-1")).toBe(false);
  });
});

describe("getChecklistProgress", () => {
  it("computes approvedCount, percentage, and gateSatisfied", async () => {
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => ({
        status: i < 3 ? ChecklistStatus.APPROVED : ChecklistStatus.PENDING,
      })) as never
    );

    const progress = await getChecklistProgress("profile-1");

    expect(progress).toMatchObject({
      approvedCount: 3,
      total: 9,
      percentage: 33,
      gateSatisfied: false,
    });
  });

  it("reports 0% and an unsatisfied gate when a student has no items yet", async () => {
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue([]);

    const progress = await getChecklistProgress("profile-1");

    expect(progress).toMatchObject({
      approvedCount: 0,
      total: 0,
      percentage: 0,
      gateSatisfied: false,
    });
  });
});

describe("uploadChecklistItemFile", () => {
  function makeFile(type: string, name = "file") {
    return new File([new Uint8Array(10)], name, { type });
  }

  it("rejects re-upload once the item is already APPROVED, without touching storage", async () => {
    prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(
      baseItem({ status: ChecklistStatus.APPROVED }) as never
    );

    await expect(
      uploadChecklistItemFile("item-1", makeFile("application/pdf"), staffUser)
    ).rejects.toThrow(ChecklistLockedError);
    expect(mockedUploadFile).not.toHaveBeenCalled();
  });

  it("uploads to a path derived from studentProfileId/requirementType and the mapped extension", async () => {
    prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(baseItem() as never);
    prismaMock.preDeploymentChecklistItem.update.mockResolvedValue(baseItem() as never);

    await uploadChecklistItemFile("item-1", makeFile("application/pdf"), staffUser);

    expect(mockedUploadFile).toHaveBeenCalledWith(
      CHECKLIST_BUCKET,
      "profile-1/MEDICAL_CERTIFICATE.pdf",
      expect.anything()
    );
  });

  it("falls back to a .bin extension for an unmapped mime type", async () => {
    prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(baseItem() as never);
    prismaMock.preDeploymentChecklistItem.update.mockResolvedValue(baseItem() as never);

    await uploadChecklistItemFile("item-1", makeFile("application/zip"), staffUser);

    expect(mockedUploadFile).toHaveBeenCalledWith(
      CHECKLIST_BUCKET,
      "profile-1/MEDICAL_CERTIFICATE.bin",
      expect.anything()
    );
  });

  it("resets a RETURNED item back to PENDING on re-upload and logs the event", async () => {
    prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(
      baseItem({ status: ChecklistStatus.RETURNED }) as never
    );
    prismaMock.preDeploymentChecklistItem.update.mockResolvedValue(baseItem() as never);

    await uploadChecklistItemFile("item-1", makeFile("image/png"), staffUser);

    expect(prismaMock.preDeploymentChecklistItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { filePath: "profile-1/MEDICAL_CERTIFICATE.png", status: ChecklistStatus.PENDING },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CHECKLIST_ITEM_UPLOADED" }),
      })
    );
  });
});

describe("reviewChecklistItem", () => {
  it("blocks a student from reviewing at all, before any lookup", async () => {
    await expect(
      reviewChecklistItem("item-1", "APPROVE", undefined, {
        id: "student-1",
        role: Role.STUDENT_INTERN,
      })
    ).rejects.toThrow(ForbiddenError);
    expect(prismaMock.preDeploymentChecklistItem.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("allows RETURN on an ungated item type without checking any underlying record", async () => {
    prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(baseItem() as never);
    prismaMock.preDeploymentChecklistItem.update.mockResolvedValue(
      baseItem({ status: ChecklistStatus.RETURNED }) as never
    );

    const result = await reviewChecklistItem("item-1", "RETURN", "needs fixing", staffUser);

    expect(result.status).toBe(ChecklistStatus.RETURNED);
    expect(prismaMock.workPlan.findFirst).not.toHaveBeenCalled();
  });

  it("allows RETURN on the WORK_PLAN item even when no work plan exists (never gated)", async () => {
    prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(
      baseItem({ requirementType: ChecklistRequirementType.WORK_PLAN }) as never
    );
    prismaMock.preDeploymentChecklistItem.update.mockResolvedValue(baseItem() as never);

    await expect(
      reviewChecklistItem("item-1", "RETURN", undefined, staffUser)
    ).resolves.toBeDefined();
    expect(prismaMock.workPlan.findFirst).not.toHaveBeenCalled();
  });

  it("approves an ungated item type without consulting WorkPlan or MoaRecord", async () => {
    prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(baseItem() as never);
    prismaMock.preDeploymentChecklistItem.update.mockResolvedValue(
      baseItem({ status: ChecklistStatus.APPROVED }) as never
    );

    const result = await reviewChecklistItem("item-1", "APPROVE", undefined, staffUser);

    expect(result.status).toBe(ChecklistStatus.APPROVED);
    expect(prismaMock.workPlan.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.studentProfile.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  describe("item 8 (WORK_PLAN) approve gate", () => {
    const workPlanItem = baseItem({ requirementType: ChecklistRequirementType.WORK_PLAN });

    it("blocks approval when there is no work plan at all", async () => {
      prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(
        workPlanItem as never
      );
      prismaMock.workPlan.findFirst.mockResolvedValue(null);

      await expect(reviewChecklistItem("item-1", "APPROVE", undefined, staffUser)).rejects.toThrow(
        ChecklistGateError
      );
    });

    it("blocks approval when the latest work plan is not APPROVED", async () => {
      prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(
        workPlanItem as never
      );
      prismaMock.workPlan.findFirst.mockResolvedValue({
        status: WorkPlanStatus.SUBMITTED,
      } as never);

      await expect(reviewChecklistItem("item-1", "APPROVE", undefined, staffUser)).rejects.toThrow(
        ChecklistGateError
      );
    });

    it("allows approval once the latest work plan is APPROVED", async () => {
      prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(
        workPlanItem as never
      );
      prismaMock.workPlan.findFirst.mockResolvedValue({ status: WorkPlanStatus.APPROVED } as never);
      prismaMock.preDeploymentChecklistItem.update.mockResolvedValue(
        baseItem({ status: ChecklistStatus.APPROVED }) as never
      );

      await expect(
        reviewChecklistItem("item-1", "APPROVE", undefined, staffUser)
      ).resolves.toMatchObject({ status: ChecklistStatus.APPROVED });
    });
  });

  describe("item 9 (MOA) approve gate", () => {
    const moaItem = baseItem({ requirementType: ChecklistRequirementType.MOA });

    it("blocks approval when the student has no company on file", async () => {
      prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(moaItem as never);
      prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
        companyId: null,
        program: "BSIT",
      } as never);

      await expect(reviewChecklistItem("item-1", "APPROVE", undefined, staffUser)).rejects.toThrow(
        ChecklistGateError
      );
      expect(prismaMock.moaRecord.findFirst).not.toHaveBeenCalled();
    });

    it("blocks approval when no MOA record covers the student's program", async () => {
      prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(moaItem as never);
      prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
        companyId: "company-1",
        program: "BSIT",
      } as never);
      prismaMock.moaRecord.findFirst.mockResolvedValue(null);

      await expect(reviewChecklistItem("item-1", "APPROVE", undefined, staffUser)).rejects.toThrow(
        ChecklistGateError
      );
    });

    it("allows approval once an APPROVED_ACTIVE MOA covers the student's program", async () => {
      prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(moaItem as never);
      prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
        companyId: "company-1",
        program: "BSIT",
      } as never);
      prismaMock.moaRecord.findFirst.mockResolvedValue({
        status: MoaStatus.APPROVED_ACTIVE,
      } as never);
      prismaMock.preDeploymentChecklistItem.update.mockResolvedValue(
        baseItem({ status: ChecklistStatus.APPROVED }) as never
      );

      await expect(
        reviewChecklistItem("item-1", "APPROVE", undefined, staffUser)
      ).resolves.toMatchObject({ status: ChecklistStatus.APPROVED });
      expect(prismaMock.moaRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: "company-1",
            status: MoaStatus.APPROVED_ACTIVE,
            programsCovered: { has: "BSIT" },
          }),
        })
      );
    });
  });
});
