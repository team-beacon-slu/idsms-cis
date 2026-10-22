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
  DEFAULT_REQUIRED_CHECKLIST,
  checklistRequirements,
  getChecklistProgress,
  isEndorsementGateSatisfied,
  reviewChecklistItem,
  setRequiredChecklistTypes,
  setStartBeforeMoa,
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

const NINE = DEFAULT_REQUIRED_CHECKLIST;
const local = { company: { isForeign: false }, classGroup: { classType: "Regular" } };
function profile(over: Record<string, unknown> = {}) {
  prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
    startBeforeMoaAllowed: false,
    startBeforeMoaReason: null,
    ...local,
    ...over,
  } as never);
}
const rows = (
  types: ChecklistRequirementType[],
  status: ChecklistStatus = ChecklistStatus.APPROVED
) => types.map((requirementType, i) => baseItem({ id: `item-${i}`, requirementType, status }));

describe("checklistRequirements", () => {
  const ctx = { isForeignCompany: false, classType: "Regular", startBeforeMoaAllowed: false };

  it("hides the conditional items when they don't apply", () => {
    const { applicable, gate } = checklistRequirements(NINE, ctx);
    expect(applicable.has(ChecklistRequirementType.PROOF_OF_CORPORATE_LEGITIMACY)).toBe(false);
    expect(applicable.has(ChecklistRequirementType.INTERNSHIP_AGREEMENT)).toBe(false);
    expect(gate.size).toBe(9);
  });

  it("applies proof to foreign-owned companies and the agreement to irregular students", () => {
    const { applicable } = checklistRequirements(NINE, {
      ...ctx,
      isForeignCompany: true,
      classType: "Irregular",
    });
    expect(applicable.has(ChecklistRequirementType.PROOF_OF_CORPORATE_LEGITIMACY)).toBe(true);
    expect(applicable.has(ChecklistRequirementType.INTERNSHIP_AGREEMENT)).toBe(true);
  });

  it("takes the MOA out of the gate when the intern may start before MOA approval", () => {
    const { applicable, gate } = checklistRequirements(NINE, {
      ...ctx,
      startBeforeMoaAllowed: true,
    });
    expect(applicable.has(ChecklistRequirementType.MOA)).toBe(true);
    expect(gate.has(ChecklistRequirementType.MOA)).toBe(false);
  });

  it("gates only what the Super Admin marked required", () => {
    const { gate } = checklistRequirements([ChecklistRequirementType.MEDICAL_CERTIFICATE], ctx);
    expect([...gate]).toEqual([ChecklistRequirementType.MEDICAL_CERTIFICATE]);
  });
});

describe("isEndorsementGateSatisfied", () => {
  it("is true when every required item is approved (default: the original nine)", async () => {
    profile();
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(rows(NINE) as never);
    expect(await isEndorsementGateSatisfied("profile-1")).toBe(true);
  });

  it("is false when a required item has no row yet", async () => {
    profile();
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(rows(NINE.slice(1)) as never);
    expect(await isEndorsementGateSatisfied("profile-1")).toBe(false);
  });

  it("is false when a required item is not approved", async () => {
    profile();
    const items = rows(NINE);
    items[0] = { ...items[0], status: ChecklistStatus.PENDING };
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(items as never);
    expect(await isEndorsementGateSatisfied("profile-1")).toBe(false);
  });

  it("ignores the MOA for an intern allowed to start before MOA approval", async () => {
    profile({ startBeforeMoaAllowed: true });
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(
      rows(NINE.filter((t) => t !== ChecklistRequirementType.MOA)) as never
    );
    expect(await isEndorsementGateSatisfied("profile-1")).toBe(true);
  });

  it("uses the Super Admin's list when one is saved", async () => {
    profile();
    prismaMock.systemConfig.findUnique.mockResolvedValue({
      configValue: [ChecklistRequirementType.MEDICAL_CERTIFICATE],
    } as never);
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(
      rows([ChecklistRequirementType.MEDICAL_CERTIFICATE]) as never
    );
    expect(await isEndorsementGateSatisfied("profile-1")).toBe(true);
  });
});

describe("getChecklistProgress", () => {
  it("counts required items and marks the rest optional", async () => {
    profile();
    prismaMock.systemConfig.findUnique.mockResolvedValue({
      configValue: NINE.filter((t) => t !== ChecklistRequirementType.COMPANY_REPLY_FORM),
    } as never);
    const items = rows(NINE, ChecklistStatus.PENDING).map((r, i) =>
      i < 3 ? { ...r, status: ChecklistStatus.APPROVED } : r
    );
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(items as never);

    const progress = await getChecklistProgress("profile-1");

    expect(progress).toMatchObject({ total: 8, gateSatisfied: false });
    expect(
      progress.items.find((i) => i.requirementType === ChecklistRequirementType.COMPANY_REPLY_FORM)
        ?.required
    ).toBe(false);
  });

  it("hides items that don't apply and still counts required ones with no rows", async () => {
    profile();
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(
      rows([ChecklistRequirementType.PROOF_OF_CORPORATE_LEGITIMACY]) as never
    );
    const progress = await getChecklistProgress("profile-1");
    expect(progress.items).toEqual([]);
    expect(progress).toMatchObject({ approvedCount: 0, total: 9, percentage: 0 });
  });
});

describe("settings", () => {
  it("saves the required list and audits it", async () => {
    await setRequiredChecklistTypes(
      [
        ChecklistRequirementType.MOA,
        ChecklistRequirementType.MOA,
        ChecklistRequirementType.WORK_PLAN,
      ],
      "admin-1"
    );
    expect(prismaMock.systemConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ configValue: ["MOA", "WORK_PLAN"] }),
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CHECKLIST_REQUIRED_ITEMS_UPDATED" }),
      })
    );
  });

  it("rejects an unknown item", async () => {
    await expect(setRequiredChecklistTypes(["NOT_A_THING"], "admin-1")).rejects.toThrow();
  });

  it("requires a reason to allow starting before MOA approval, and logs who did it", async () => {
    await expect(
      setStartBeforeMoa("profile-1", { allowed: true, reason: "" }, staffUser)
    ).rejects.toThrow();
    await setStartBeforeMoa(
      "profile-1",
      { allowed: true, reason: "MOA signed by the HTE, awaiting notarization" },
      staffUser
    );
    expect(prismaMock.studentProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: expect.objectContaining({
        startBeforeMoaAllowed: true,
        startBeforeMoaBy: "coordinator-1",
      }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "START_BEFORE_MOA_ALLOWED" }),
      })
    );
  });

  it("does not let a student change it", async () => {
    await expect(
      setStartBeforeMoa("profile-1", { allowed: false }, { id: "s-1", role: Role.STUDENT_INTERN })
    ).rejects.toThrow(ForbiddenError);
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
