import { Role } from "@prisma/client";
import { ZodError } from "zod";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  ClassGroupStateError,
  assignAdviser,
  createClassGroup,
  deleteClassGroup,
  renameClassGroup,
  removeAdviser,
} from "@/lib/services/classGroupService";

beforeEach(() => resetPrismaMock());

const FACULTY = "11111111-1111-4111-8111-111111111111";
const SEMESTER = "22222222-2222-4222-8222-222222222222";

describe("createClassGroup", () => {
  it("refuses an end date before the start date", async () => {
    await expect(
      createClassGroup(
        { name: "BSIT 4A", program: "BSIT", startDate: "2026-12-01", endDate: "2026-08-01" },
        "coord-1"
      )
    ).rejects.toThrow(ZodError);
    expect(prismaMock.classGroup.create).not.toHaveBeenCalled();
  });

  it("creates the group with Regular as the default class type and logs it", async () => {
    prismaMock.classGroup.create.mockResolvedValue({ id: "cg-1" } as never);

    await createClassGroup(
      { name: " BSIT 4A ", program: "BSIT", startDate: "2026-08-01", endDate: "2026-12-15" },
      "coord-1"
    );

    expect(prismaMock.classGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "BSIT 4A", classType: "Regular" }),
      select: { id: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "CLASS_GROUP_CREATED" }) })
    );
  });
});

describe("assignAdviser", () => {
  const input = { facultyId: FACULTY, semesterId: SEMESTER };
  function setup(over: { role?: Role; isActive?: boolean; archivedAt?: Date | null } = {}) {
    prismaMock.classGroup.findUnique.mockResolvedValue({ deletedAt: null } as never);
    prismaMock.user.findUnique.mockResolvedValue({
      role: over.role ?? Role.FACULTY_ADVISER,
      isActive: over.isActive ?? true,
      deletedAt: null,
    } as never);
    prismaMock.semester.findUnique.mockResolvedValue({
      archivedAt: over.archivedAt ?? null,
    } as never);
  }

  it.each([
    ["a coordinator", { role: Role.DEPARTMENT_COORDINATOR }],
    ["a deactivated adviser", { isActive: false }],
    ["an archived semester", { archivedAt: new Date() }],
  ])("refuses %s", async (_n, over) => {
    setup(over);
    await expect(assignAdviser("cg-1", input, "coord-1")).rejects.toThrow(ClassGroupStateError);
    expect(prismaMock.facultyClassGroup.create).not.toHaveBeenCalled();
  });

  it("refuses the same adviser twice for one semester", async () => {
    setup();
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue({ id: "fcg-1" } as never);
    await expect(assignAdviser("cg-1", input, "coord-1")).rejects.toThrow(/already assigned/);
  });

  it("assigns and logs", async () => {
    setup();
    prismaMock.facultyClassGroup.findFirst.mockResolvedValue(null);
    prismaMock.facultyClassGroup.create.mockResolvedValue({ id: "fcg-2" } as never);

    await expect(assignAdviser("cg-1", input, "coord-1")).resolves.toEqual({ id: "fcg-2" });
    expect(prismaMock.facultyClassGroup.create).toHaveBeenCalledWith({
      data: { facultyId: FACULTY, classGroupId: "cg-1", semesterId: SEMESTER },
      select: { id: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ADVISER_ASSIGNED" }) })
    );
  });
});

describe("removeAdviser", () => {
  it("deletes the assignment and logs who was removed", async () => {
    prismaMock.facultyClassGroup.delete.mockResolvedValue({
      classGroupId: "cg-1",
      facultyId: FACULTY,
      semesterId: SEMESTER,
    } as never);

    await removeAdviser("fcg-1", "coord-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ADVISER_UNASSIGNED", entityId: "cg-1" }),
      })
    );
  });
});

describe("renameClassGroup / deleteClassGroup", () => {
  it("renames and logs old and new names", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValue({
      name: "BSIT 4A",
      deletedAt: null,
    } as never);
    await renameClassGroup("cg-1", { name: " BSIT 4B " }, "coord-1");
    expect(prismaMock.classGroup.update).toHaveBeenCalledWith({
      where: { id: "cg-1" },
      data: { name: "BSIT 4B" },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CLASS_GROUP_RENAMED",
          detail: { from: "BSIT 4A", to: "BSIT 4B" },
        }),
      })
    );
  });

  it("refuses to delete a group that still has interns", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValue({
      name: "BSIT 4A",
      deletedAt: null,
      _count: { students: 3 },
    } as never);
    await expect(deleteClassGroup("cg-1", "coord-1")).rejects.toThrow(ClassGroupStateError);
    expect(prismaMock.classGroup.update).not.toHaveBeenCalled();
  });

  it("soft-deletes an empty group and drops its adviser assignments", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValue({
      name: "BSIT 4A",
      deletedAt: null,
      _count: { students: 0 },
    } as never);
    await deleteClassGroup("cg-1", "coord-1");
    expect(prismaMock.facultyClassGroup.deleteMany).toHaveBeenCalledWith({
      where: { classGroupId: "cg-1" },
    });
    expect(prismaMock.classGroup.update).toHaveBeenCalledWith({
      where: { id: "cg-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "CLASS_GROUP_DELETED" }) })
    );
  });
});
