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
  getChecklistProgress,
  isEndorsementGateSatisfied,
  reviewChecklistItem,
} from "@/lib/services/checklistService";
import { ForbiddenError } from "@/lib/services/userService";

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

  it("reports 0 of the 9 requirements when a student has no items yet", async () => {
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue([]);

    const progress = await getChecklistProgress("profile-1");

    // All 9 are required whether or not their rows exist yet, matching "9 not yet approved".
    expect(progress).toMatchObject({
      approvedCount: 0,
      total: 9,
      percentage: 0,
      gateSatisfied: false,
    });
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

  it("approves an item that has no stored file (D7: documents live in Google Classroom)", async () => {
    prismaMock.preDeploymentChecklistItem.findUniqueOrThrow.mockResolvedValue(
      baseItem({ filePath: null }) as never
    );
    prismaMock.preDeploymentChecklistItem.update.mockResolvedValue(
      baseItem({ status: ChecklistStatus.APPROVED }) as never
    );

    await expect(
      reviewChecklistItem("item-1", "APPROVE", undefined, staffUser)
    ).resolves.toMatchObject({ status: ChecklistStatus.APPROVED });
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
            // A still-valid agreement: active or marked expiring, and not past its end date.
            status: { in: [MoaStatus.APPROVED_ACTIVE, MoaStatus.EXPIRING] },
            validTo: { gte: expect.any(Date) },
            programsCovered: { has: "BSIT" },
          }),
        })
      );
    });
  });
});
