jest.mock("@/lib/services/notifications/notify", () => ({ notify: jest.fn(async () => ({})) }));

import { Role } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import {
  fileRetraction,
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
