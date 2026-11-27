jest.mock("@/lib/services/accounts/auditService", () => ({ logEvent: jest.fn() }));

import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { logEvent } from "@/lib/services/accounts/auditService";
import {
  addCustomRequirement,
  BUILT_IN_CHECKLIST_TYPES,
  customChecklistRows,
  CustomRequirementError,
  requiredCustomIds,
  retireCustomRequirement,
} from "@/lib/services/predeployment/customRequirementService";

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(logEvent).mockClear();
});

it("keeps CUSTOM out of the built-in list", () => {
  expect(BUILT_IN_CHECKLIST_TYPES).toHaveLength(11);
  expect(BUILT_IN_CHECKLIST_TYPES).not.toContain("CUSTOM");
});

describe("addCustomRequirement", () => {
  it("creates it, gives current interns of the picked programs a pending item, and logs it", async () => {
    prismaMock.checklistCustomRequirement.create.mockResolvedValue({ id: "cr-1" } as never);
    prismaMock.studentProfile.findMany.mockResolvedValue([{ id: "p-1" }, { id: "p-2" }] as never);
    prismaMock.preDeploymentChecklistItem.createMany.mockResolvedValue({ count: 2 });

    const result = await addCustomRequirement(
      { name: "  Vaccination card ", programs: ["BSIT", "BSIT"], required: true },
      "coord-1"
    );

    expect(result).toEqual({ id: "cr-1", itemsCreated: 2 });
    expect(prismaMock.checklistCustomRequirement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "Vaccination card",
          description: null,
          programs: ["BSIT"],
          required: true,
          createdById: "coord-1",
        },
      })
    );
    expect(prismaMock.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, semester: { isActive: true }, program: { in: ["BSIT"] } },
      })
    );
    expect(prismaMock.preDeploymentChecklistItem.createMany).toHaveBeenCalledWith({
      data: [
        { studentProfileId: "p-1", requirementType: "CUSTOM", customRequirementId: "cr-1" },
        { studentProfileId: "p-2", requirementType: "CUSTOM", customRequirementId: "cr-1" },
      ],
      skipDuplicates: true,
    });
    expect(jest.mocked(logEvent).mock.calls[0][0]).toEqual(
      expect.objectContaining({ action: "CHECKLIST_REQUIREMENT_ADDED", entityId: "cr-1" })
    );
  });

  it("with no program picked, reaches every program's interns", async () => {
    prismaMock.checklistCustomRequirement.create.mockResolvedValue({ id: "cr-1" } as never);
    prismaMock.studentProfile.findMany.mockResolvedValue([]);
    prismaMock.preDeploymentChecklistItem.createMany.mockResolvedValue({ count: 0 });

    await addCustomRequirement({ name: "Insurance", required: false }, "coord-1");

    expect(prismaMock.studentProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, semester: { isActive: true } } })
    );
  });

  it("rejects a blank name or an unknown program before touching the database", async () => {
    await expect(addCustomRequirement({ name: " " }, "c")).rejects.toThrow();
    await expect(
      addCustomRequirement({ name: "Insurance", programs: ["BSN"] }, "c")
    ).rejects.toThrow();
    expect(prismaMock.checklistCustomRequirement.create).not.toHaveBeenCalled();
  });
});

describe("retireCustomRequirement", () => {
  it("sets it inactive (never deletes) and logs it", async () => {
    prismaMock.checklistCustomRequirement.findUnique.mockResolvedValue({
      name: "Insurance",
      active: true,
    } as never);

    await retireCustomRequirement("cr-1", "admin-1");

    expect(prismaMock.checklistCustomRequirement.update).toHaveBeenCalledWith({
      where: { id: "cr-1" },
      data: { active: false },
    });
    expect(prismaMock.checklistCustomRequirement.delete).not.toHaveBeenCalled();
    expect(jest.mocked(logEvent).mock.calls[0][0]).toEqual(
      expect.objectContaining({ action: "CHECKLIST_REQUIREMENT_RETIRED", entityId: "cr-1" })
    );
  });

  it("refuses a missing or already retired requirement", async () => {
    prismaMock.checklistCustomRequirement.findUnique.mockResolvedValue(null);
    await expect(retireCustomRequirement("x", "a")).rejects.toBeInstanceOf(CustomRequirementError);
    prismaMock.checklistCustomRequirement.findUnique.mockResolvedValue({
      name: "Insurance",
      active: false,
    } as never);
    await expect(retireCustomRequirement("x", "a")).rejects.toBeInstanceOf(CustomRequirementError);
    expect(prismaMock.checklistCustomRequirement.update).not.toHaveBeenCalled();
  });
});

describe("matching by program", () => {
  const customs = [
    { id: "all", programs: [], required: true, active: true },
    { id: "cs", programs: ["BSCS" as const], required: true, active: true },
    { id: "opt", programs: [], required: false, active: true },
    { id: "old", programs: [], required: true, active: false },
  ];

  const allRows = ["all", "cs", "opt", "old", null];

  it("gates only active, required ones for the intern's program", () => {
    expect(requiredCustomIds(customs, "BSIT", allRows)).toEqual(["all"]);
    expect(requiredCustomIds(customs, "BSCS", allRows)).toEqual(["all", "cs"]);
  });

  it("never gates an intern on a requirement they have no checklist row for", () => {
    // e.g. the intern was in an inactive semester when the requirement was added
    expect(requiredCustomIds(customs, "BSCS", ["cs", null])).toEqual(["cs"]);
    expect(requiredCustomIds(customs, "BSIT", [])).toEqual([]);
  });

  it("gives a newly imported intern a row for each active one of their program", async () => {
    prismaMock.checklistCustomRequirement.findMany.mockResolvedValue(
      customs.filter((c) => c.active) as never
    );
    const rows = await customChecklistRows("p-9", "BSIT", prismaMock);
    expect(rows.map((r) => r.customRequirementId)).toEqual(["all", "opt"]);
    expect(rows.every((r) => r.requirementType === "CUSTOM")).toBe(true);
  });
});
