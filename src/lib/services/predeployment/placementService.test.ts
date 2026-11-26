jest.mock("@/lib/services/notifications/notify", () => ({ notify: jest.fn(async () => ({})) }));

import { Role } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import {
  changeSupervisor,
  fileRetraction,
  hostForWeek,
  noteRetraction,
  PlacementStateError,
} from "@/lib/services/predeployment/placementService";

const student = { id: "student-1", role: Role.STUDENT_INTERN };
const coordinator = { id: "coord-1", role: Role.DEPARTMENT_COORDINATOR };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

beforeEach(() => {
  resetPrismaMock();
  // assertCanAccessStudent: the intern owns profile-1.
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    userId: "student-1",
    classGroupId: "cg-1",
    semesterId: "s-1",
  } as never);
  prismaMock.facultyClassGroup.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("fileRetraction", () => {
  it("records the intern's last day and reason on the open placement", async () => {
    prismaMock.companyPlacement.findFirst.mockResolvedValue({
      id: "pl-1",
      startedOn: d("2026-06-01"),
      company: { name: "Acme" },
    } as never);
    await fileRetraction(
      "profile-1",
      { lastDay: "2026-07-15", reason: "The company closed my team." },
      student
    );
    expect(prismaMock.companyPlacement.update).toHaveBeenCalledWith({
      where: { id: "pl-1" },
      data: expect.objectContaining({
        retractionLastDay: d("2026-07-15"),
        retractionReason: "The company closed my team.",
        retractionFiledAt: expect.any(Date),
      }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("refuses staff, a last day before the start, and an intern with no company", async () => {
    await expect(
      fileRetraction("profile-1", { lastDay: "2026-07-15", reason: "x".repeat(12) }, coordinator)
    ).rejects.toThrow(ForbiddenError);
    prismaMock.companyPlacement.findFirst.mockResolvedValue({
      id: "pl-1",
      startedOn: d("2026-06-01"),
      company: { name: "Acme" },
    } as never);
    await expect(
      fileRetraction("profile-1", { lastDay: "2026-05-30", reason: "x".repeat(12) }, student)
    ).rejects.toThrow(PlacementStateError);
    prismaMock.companyPlacement.findFirst.mockResolvedValue(null);
    await expect(
      fileRetraction("profile-1", { lastDay: "2026-07-15", reason: "x".repeat(12) }, student)
    ).rejects.toThrow("no current host company");
  });
});

describe("noteRetraction", () => {
  const filed = {
    studentProfileId: "profile-1",
    endedOn: null,
    retractionFiledAt: new Date(),
    retractionLastDay: d("2026-07-15"),
    studentProfile: { userId: "student-1" },
  };

  it("ends the placement on the last day and frees the intern to join another company", async () => {
    prismaMock.companyPlacement.findUnique.mockResolvedValue(filed as never);
    await noteRetraction("pl-1", coordinator);
    expect(prismaMock.companyPlacement.update).toHaveBeenCalledWith({
      where: { id: "pl-1" },
      data: expect.objectContaining({
        endedOn: d("2026-07-15"),
        endReason: "RETRACTED",
        retractionNotedById: "coord-1",
      }),
    });
    expect(prismaMock.studentProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { companyId: null, positionTitle: null },
    });
  });

  it("only staff note, and only an open retraction", async () => {
    await expect(noteRetraction("pl-1", student)).rejects.toThrow(ForbiddenError);
    prismaMock.companyPlacement.findUnique.mockResolvedValue({
      ...filed,
      retractionFiledAt: null,
    } as never);
    await expect(noteRetraction("pl-1", coordinator)).rejects.toThrow(PlacementStateError);
  });
});

describe("changeSupervisor", () => {
  const open = {
    studentProfileId: "profile-1",
    startedOn: d("2026-06-01"),
    endedOn: null,
    company: { name: "Acme" },
  };
  const input = {
    supervisorName: "Rosa Reyes",
    supervisorContact: "rosa@acme.test",
    effectiveFrom: "2026-07-01",
  };

  it("records the new supervisor from the given day and tells the staff", async () => {
    prismaMock.companyPlacement.findUnique.mockResolvedValue(open as never);
    prismaMock.placementSupervisor.create.mockResolvedValue({ id: "ps-1" } as never);
    await changeSupervisor("pl-1", input, student);
    expect(prismaMock.placementSupervisor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        placementId: "pl-1",
        supervisorName: "Rosa Reyes",
        effectiveFrom: d("2026-07-01"),
        createdBy: "student-1",
      }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("refuses an ended placement and a day before the placement started", async () => {
    prismaMock.companyPlacement.findUnique.mockResolvedValue({
      ...open,
      endedOn: d("2026-07-15"),
    } as never);
    await expect(changeSupervisor("pl-1", input, student)).rejects.toThrow(PlacementStateError);
    prismaMock.companyPlacement.findUnique.mockResolvedValue(open as never);
    await expect(
      changeSupervisor("pl-1", { ...input, effectiveFrom: "2026-05-01" }, student)
    ).rejects.toThrow(PlacementStateError);
    expect(prismaMock.placementSupervisor.create).not.toHaveBeenCalled();
  });

  it("refuses a future day", async () => {
    prismaMock.companyPlacement.findUnique.mockResolvedValue(open as never);
    await expect(
      changeSupervisor("pl-1", { ...input, effectiveFrom: "2999-01-01" }, student)
    ).rejects.toThrow(PlacementStateError);
  });
});

describe("hostForWeek", () => {
  const mon = d("2026-07-06");
  const sun = d("2026-07-12");

  it("takes the placement the week falls in (the later one after a mid-week move)", async () => {
    prismaMock.companyPlacement.findFirst.mockResolvedValue({
      endedOn: null,
      company: { name: "Beta Inc", supervisorName: "New Boss" },
      supervisors: [],
    } as never);
    await expect(hostForWeek("profile-1", mon, sun)).resolves.toEqual({
      name: "Beta Inc",
      supervisorName: "New Boss",
    });
    expect(prismaMock.companyPlacement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentProfileId: "profile-1",
          startedOn: { lte: sun },
          OR: [{ endedOn: null }, { endedOn: { gte: mon } }],
        },
        orderBy: { startedOn: "desc" },
      })
    );
  });

  it("prints the supervisor in charge at the end of the week", async () => {
    prismaMock.companyPlacement.findFirst.mockResolvedValue({
      endedOn: null,
      company: { name: "Acme", supervisorName: "Old Boss" },
      // Latest first, as queried: changed on Wednesday of this week.
      supervisors: [{ supervisorName: "Rosa Reyes", effectiveFrom: d("2026-07-08") }],
    } as never);
    await expect(hostForWeek("profile-1", mon, sun)).resolves.toEqual({
      name: "Acme",
      supervisorName: "Rosa Reyes",
    });
  });

  it("ignores a change dated after the placement ended", async () => {
    prismaMock.companyPlacement.findFirst.mockResolvedValue({
      endedOn: d("2026-07-07"),
      company: { name: "Acme", supervisorName: "Old Boss" },
      supervisors: [{ supervisorName: "Too Late", effectiveFrom: d("2026-07-09") }],
    } as never);
    await expect(hostForWeek("profile-1", mon, sun)).resolves.toEqual({
      name: "Acme",
      supervisorName: "Old Boss",
    });
  });

  it("is null without a placement in the week (callers use the current company)", async () => {
    prismaMock.companyPlacement.findFirst.mockResolvedValue(null);
    await expect(hostForWeek("profile-1", mon, sun)).resolves.toBeNull();
  });
});
