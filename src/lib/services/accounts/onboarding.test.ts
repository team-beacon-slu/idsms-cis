import { ChecklistRequirementType, Prisma } from "@prisma/client";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  completeOwnStudentProfile,
  ForbiddenError,
  OnboardingError,
} from "@/lib/services/accounts/userService";

beforeEach(() => resetPrismaMock());

const hours = jest.fn(async () => 486);
const student = { role: "STUDENT_INTERN", privacyConsentVersion: PRIVACY_NOTICE_VERSION };
const input = { studentNumber: "2026-00999", classGroupId: "cg-1" };

function arrange(
  over: { user?: unknown; group?: unknown; semester?: unknown; taken?: unknown } = {}
) {
  prismaMock.user.findUnique.mockResolvedValue(
    ("user" in over ? over.user : { ...student, studentProfile: null }) as never
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
  ["a profile already exists", { user: { ...student, studentProfile: { id: "sp-0" } } }],
  ["the class group is gone", { group: null }],
  ["no semester is active", { semester: null }],
  ["the student number is taken", { taken: { id: "sp-x" } }],
  [
    "the privacy notice is not accepted",
    { user: { ...student, privacyConsentVersion: null, studentProfile: null } },
  ],
])("explains when %s, and creates nothing", async (_, over) => {
  arrange(over);
  await expect(completeOwnStudentProfile("u1", input, hours)).rejects.toBeInstanceOf(
    OnboardingError
  );
  expect(prismaMock.studentProfile.create).not.toHaveBeenCalled();
});

it("only offers a class group an adviser holds in the active semester", async () => {
  arrange();
  await completeOwnStudentProfile("u1", input, hours);
  expect(prismaMock.classGroup.findFirst.mock.calls[0]![0]).toMatchObject({
    where: { facultyGroups: { some: { semester: { isActive: true } } } },
  });
});

it("turns a lost race for the same student number into the friendly message", async () => {
  arrange();
  prismaMock.studentProfile.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" })
  );
  await expect(completeOwnStudentProfile("u1", input, hours)).rejects.toThrow(
    "That student number is already registered."
  );
});
