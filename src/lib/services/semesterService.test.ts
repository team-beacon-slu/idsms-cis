import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  SemesterStateError,
  activateSemester,
  archiveSemester,
  createSemester,
  listSemesters,
  setSemesterWeekOne,
} from "@/lib/services/semesterService";

beforeEach(() => resetPrismaMock());

const callOrder = (fn: unknown) => (fn as jest.Mock).mock.invocationCallOrder[0];

describe("activateSemester", () => {
  it("deactivates all, then activates one, then logs, inside one transaction", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({ id: "s1", archivedAt: null } as never);

    await activateSemester("s1", "admin-1");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.semester.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: { isActive: false },
    });
    expect(prismaMock.semester.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { isActive: true },
    });
    expect(callOrder(prismaMock.semester.updateMany)).toBeLessThan(
      callOrder(prismaMock.semester.update)
    );
    expect(callOrder(prismaMock.semester.update)).toBeLessThan(
      callOrder(prismaMock.auditLog.create)
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-1",
        action: "SEMESTER_ACTIVATED",
        entityType: "Semester",
        entityId: "s1",
      }),
    });
  });

  it("locks the semester rows first, before any state read or write", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({ id: "s1", archivedAt: null } as never);

    await activateSemester("s1", "admin-1");

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = (prismaMock.$queryRaw as jest.Mock).mock.calls[0][0].join("");
    expect(sql).toMatch(/FROM semesters FOR UPDATE/);
    expect(callOrder(prismaMock.$queryRaw)).toBeLessThan(callOrder(prismaMock.semester.findUnique));
    expect(callOrder(prismaMock.$queryRaw)).toBeLessThan(callOrder(prismaMock.semester.updateMany));
    expect(callOrder(prismaMock.$queryRaw)).toBeLessThan(callOrder(prismaMock.semester.update));
  });

  it("refuses an archived semester", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({
      id: "s1",
      archivedAt: new Date(),
    } as never);
    await expect(activateSemester("s1", "a")).rejects.toThrow(
      new SemesterStateError("Archived semesters can't be activated")
    );
    expect(prismaMock.semester.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an unknown semester", async () => {
    prismaMock.semester.findUnique.mockResolvedValue(null);
    await expect(activateSemester("nope", "a")).rejects.toThrow("Semester not found");
    expect(prismaMock.semester.updateMany).not.toHaveBeenCalled();
  });
});

describe("archiveSemester", () => {
  it("sets archivedAt and isActive false, logs, and never deletes anything", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({ id: "s1", archivedAt: null } as never);

    await archiveSemester("s1", "admin-1");

    expect(prismaMock.semester.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { archivedAt: expect.any(Date), isActive: false },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "SEMESTER_ARCHIVED", entityId: "s1" }),
    });
    expect(prismaMock.semester.delete).not.toHaveBeenCalled();
    expect(prismaMock.semester.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.studentProfile.deleteMany).not.toHaveBeenCalled();
  });

  it("locks the semester rows first, before the archive update", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({ id: "s1", archivedAt: null } as never);

    await archiveSemester("s1", "admin-1");

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(callOrder(prismaMock.$queryRaw)).toBeLessThan(callOrder(prismaMock.semester.findUnique));
    expect(callOrder(prismaMock.$queryRaw)).toBeLessThan(callOrder(prismaMock.semester.update));
  });

  it("refuses an already archived semester", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({
      id: "s1",
      archivedAt: new Date(),
    } as never);
    await expect(archiveSemester("s1", "a")).rejects.toBeInstanceOf(SemesterStateError);
    expect(prismaMock.semester.update).not.toHaveBeenCalled();
  });

  it("refuses an unknown semester", async () => {
    prismaMock.semester.findUnique.mockResolvedValue(null);
    await expect(archiveSemester("nope", "a")).rejects.toThrow("Semester not found");
  });
});

describe("createSemester", () => {
  const valid = {
    name: "1st Semester",
    academicYear: "2026-2027",
    startDate: "2026-08-01",
    endDate: "2026-12-15",
  };

  it("creates the semester and logs it", async () => {
    prismaMock.semester.create.mockResolvedValue({ id: "new-1" } as never);
    await expect(createSemester(valid, "admin-1")).resolves.toEqual({ id: "new-1" });
    expect(prismaMock.semester.create).toHaveBeenCalledWith({
      data: {
        name: "1st Semester",
        academicYear: "2026-2027",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-12-15"),
      },
      select: { id: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "SEMESTER_CREATED", entityId: "new-1" }),
    });
  });

  it("rejects startDate >= endDate", async () => {
    await expect(
      createSemester({ ...valid, startDate: "2026-12-15", endDate: "2026-12-15" }, "a")
    ).rejects.toThrow();
    expect(prismaMock.semester.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed academic year", async () => {
    await expect(createSemester({ ...valid, academicYear: "2026/27" }, "a")).rejects.toThrow();
    expect(prismaMock.semester.create).not.toHaveBeenCalled();
  });
});

describe("setSemesterWeekOne", () => {
  it("stores the faculty-defined Week 1 start and audits it", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({ id: "s1", archivedAt: null } as never);
    await setSemesterWeekOne("s1", { weekOneStart: "2026-08-10" }, "coord-1");
    expect(prismaMock.semester.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { weekOneStart: new Date("2026-08-10T00:00:00Z") },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SEMESTER_WEEK_ONE_SET", entityId: "s1" }),
      })
    );
  });

  it("clears it with null", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({ id: "s1", archivedAt: null } as never);
    await setSemesterWeekOne("s1", { weekOneStart: null }, "coord-1");
    expect(prismaMock.semester.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { weekOneStart: null },
    });
  });

  it("refuses an archived semester", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({ id: "s1", archivedAt: new Date() } as never);
    await expect(setSemesterWeekOne("s1", { weekOneStart: "2026-08-10" }, "c")).rejects.toThrow(
      SemesterStateError
    );
  });
});

describe("createSemester weekOneStart", () => {
  it("accepts an optional Week 1 start", async () => {
    prismaMock.semester.create.mockResolvedValue({ id: "s9" } as never);
    await createSemester(
      {
        name: "1st Sem",
        academicYear: "2026-2027",
        startDate: "2026-08-03",
        endDate: "2026-12-18",
        weekOneStart: "2026-08-10",
      },
      "admin-1"
    );
    expect(prismaMock.semester.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ weekOneStart: new Date("2026-08-10T00:00:00Z") }),
      })
    );
  });
});

describe("listSemesters", () => {
  it("returns newest first with student counts", async () => {
    prismaMock.semester.findMany.mockResolvedValue([] as never);
    await listSemesters();
    expect(prismaMock.semester.findMany).toHaveBeenCalledWith({
      orderBy: { startDate: "desc" },
      select: expect.objectContaining({ _count: { select: { students: true } } }),
    });
  });
});
