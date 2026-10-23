import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  getAssignedFacultyIds,
  getDepartmentStaffIds,
  getStudentUserId,
} from "@/lib/services/notifications/notificationRecipients";

beforeEach(() => resetPrismaMock());

it("getStudentUserId resolves the owning user", async () => {
  prismaMock.studentProfile.findUnique.mockResolvedValue({ userId: "u-1" } as never);
  await expect(getStudentUserId("p-1")).resolves.toBe("u-1");
});

it("getAssignedFacultyIds uses the student's class group and semester", async () => {
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    classGroupId: "cg",
    semesterId: "sem",
  } as never);
  prismaMock.facultyClassGroup.findMany.mockResolvedValue([
    { facultyId: "f-1" },
    { facultyId: "f-1" },
  ] as never);
  await expect(getAssignedFacultyIds("p-1")).resolves.toEqual(["f-1"]);
  expect(prismaMock.facultyClassGroup.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { classGroupId: "cg", semesterId: "sem" } })
  );
});

it("getDepartmentStaffIds returns active coordinators and admins", async () => {
  prismaMock.user.findMany.mockResolvedValue([{ id: "c-1" }, { id: "a-1" }] as never);
  await expect(getDepartmentStaffIds()).resolves.toEqual(["c-1", "a-1"]);
});
