import { ChecklistRequirementType } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  completeOwnStudentProfile,
  ForbiddenError,
  OnboardingError,
} from "@/lib/services/accounts/userService";

beforeEach(() => resetPrismaMock());

const hours = jest.fn(async () => 486);
const input = { studentNumber: "2026-00999", classGroupId: "cg-1" };

function arrange(
  over: { user?: unknown; group?: unknown; semester?: unknown; taken?: unknown } = {}
) {
  prismaMock.user.findUnique.mockResolvedValue(
    ("user" in over ? over.user : { role: "STUDENT_INTERN", studentProfile: null }) as never
  );
  prismaMock.classGroup.findFirst.mockResolvedValue(
    ("group" in over ? over.group : { id: "cg-1", program: "BSIT" }) as never
  );
  prismaMock.semester.findFirst.mockResolvedValue(
    ("semester" in over ? over.semester : { id: "sem-1" }) as never
  );
  prismaMock.studentProfile.findUnique.mockResolvedValue(
    ("taken" in over ? over.taken : null) as never
  );
  prismaMock.studentProfile.create.mockResolvedValue({ id: "sp-1" } as never);
}

it("creates the profile from the class group, the active semester and the program's hours", async () => {
  arrange();
  await expect(completeOwnStudentProfile("u1", input, hours)).resolves.toEqual({
    studentProfileId: "sp-1",
  });
  expect(prismaMock.studentProfile.create).toHaveBeenCalledWith({
    data: {
      userId: "u1",
      studentNumber: "2026-00999",
      program: "BSIT",
      classGroupId: "cg-1",
      semesterId: "sem-1",
      requiredHours: 486,
    },
  });
  expect(hours).toHaveBeenCalledWith("BSIT");
  // The same checklist rows the coordinator import seeds: one per requirement type.
  const rows = prismaMock.preDeploymentChecklistItem.createMany.mock.calls[0][0]!.data as unknown[];
  expect(rows).toHaveLength(Object.values(ChecklistRequirementType).length);
  expect(prismaMock.auditLog.create).toHaveBeenCalled();
});

it("refuses anyone who is not a student intern", async () => {
  arrange({ user: { role: "FACULTY_ADVISER", studentProfile: null } });
  await expect(completeOwnStudentProfile("u1", input, hours)).rejects.toBeInstanceOf(
    ForbiddenError
  );
});

it.each([
  [
    "a profile already exists",
    { user: { role: "STUDENT_INTERN", studentProfile: { id: "sp-0" } } },
  ],
  ["the class group is gone", { group: null }],
  ["no semester is active", { semester: null }],
  ["the student number is taken", { taken: { id: "sp-x" } }],
])("explains when %s, and creates nothing", async (_, over) => {
  arrange(over);
  await expect(completeOwnStudentProfile("u1", input, hours)).rejects.toBeInstanceOf(
    OnboardingError
  );
  expect(prismaMock.studentProfile.create).not.toHaveBeenCalled();
});
