import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  getComplianceRows,
  reportState,
  resolveComplianceScope,
  resolveDepartmentSemester,
  summarize,
  summarizeByProgram,
  type ComplianceRow,
} from "@/lib/services/complianceService";

import { ForbiddenError } from "@/lib/services/userService";

beforeEach(() => {
  resetPrismaMock();
});

const NOW = new Date("2026-10-12T00:00:00Z"); // Mon 08:00 Manila -> due week 2026-10-05

const entries = (...hours: Array<number | null>) =>
  hours.map((h) => ({ actualHours: h === null ? null : { toString: () => String(h) } }));

const profile = (over: Record<string, unknown> = {}) => ({
  id: "sp-1",
  studentNumber: "2021-0001",
  fullName: "Ana Cruz",
  program: "BSIT",
  classGroupId: "cg-1",
  companyId: "co-1",
  requiredHours: 486,
  user: { email: "ana@slu.edu.ph" },
  classGroup: { name: "BSIT 4A" },
  company: { name: "Acme" },
  checklistItems: Array.from({ length: 9 }, () => ({ status: "APPROVED" })),
  weeklyReports: [],
  ...over,
});

describe("reportState", () => {
  it.each([
    [undefined, "NOT_STARTED"],
    [{ status: "APPROVED", revisionHistory: [] }, "APPROVED"],
    [{ status: "REGARDED", revisionHistory: [] }, "REGARDED"],
    [{ status: "DISREGARDED", revisionHistory: [] }, "DISREGARDED"],
    [{ status: "RETURNED", revisionHistory: [] }, "RETURNED"],
    [{ status: "PENDING", revisionHistory: [{ type: "SUBMITTED" }] }, "SUBMITTED"],
    [{ status: "PENDING", revisionHistory: [] }, "DRAFT"],
  ] as const)("%j -> %s", (report, expected) => {
    expect(reportState(report as never)).toBe(expected);
  });
});

describe("getComplianceRows", () => {
  it("computes hours, due-week state, awaiting review and status for a deployed student", async () => {
    prismaMock.studentProfile.findMany.mockResolvedValue([
      profile({
        weeklyReports: [
          {
            weekStart: new Date("2026-09-28T00:00:00Z"),
            status: "APPROVED",
            revisionHistory: [],
            dailyEntries: entries(8, 8),
          },
          {
            weekStart: new Date("2026-10-05T00:00:00Z"),
            status: "PENDING",
            revisionHistory: [{ type: "SUBMITTED" }],
            dailyEntries: entries(8),
          },
        ],
      }),
    ] as never);

    const [row] = await getComplianceRows({ kind: "department", semesterId: "sem-1" }, NOW);

    expect(row.confirmedHours).toBe(16); // the SUBMITTED week is not confirmed yet
    expect(row.hoursPercent).toBe(Math.round((16 / 486) * 100));
    expect(row.dueWeekStart).toBe("2026-10-05");
    expect(row.dueWeekState).toBe("SUBMITTED");
    expect(row.awaitingReview).toBe(1);
    expect(row.checklistApproved).toBe(9);
    expect(row.checklistTotal).toBe(9);
    expect(row.status).toBe("ON_TRACK");
    expect(row.company).toBe("Acme");
    expect(row.classGroup).toBe("BSIT 4A");
    expect(row.email).toBe("ana@slu.edu.ph");
  });

  it("gives a student with no reports, checklist or company zeros, never NaN", async () => {
    prismaMock.studentProfile.findMany.mockResolvedValue([
      profile({ companyId: null, company: null, checklistItems: [], weeklyReports: [] }),
    ] as never);

    const [row] = await getComplianceRows({ kind: "department", semesterId: "sem-1" }, NOW);

    expect(row.confirmedHours).toBe(0);
    expect(row.checklistTotal).toBe(0);
    expect(row.hoursPercent).toBe(0);
    expect(row.dueWeekState).toBe("NOT_STARTED");
    expect(row.status).toBe("NOT_DEPLOYED");
    expect(row.company).toBeNull();
  });

  it("does not divide by zero when required hours are 0", async () => {
    prismaMock.studentProfile.findMany.mockResolvedValue([profile({ requiredHours: 0 })] as never);
    const [row] = await getComplianceRows({ kind: "department", semesterId: "sem-1" }, NOW);
    expect(row.hoursPercent).toBe(0);
    expect(row.status).not.toBe("COMPLETED");
  });

  it("marks COMPLETED once confirmed hours reach the requirement and caps percent at 100", async () => {
    prismaMock.studentProfile.findMany.mockResolvedValue([
      profile({
        requiredHours: 10,
        weeklyReports: [
          {
            weekStart: new Date("2026-09-28T00:00:00Z"),
            status: "REGARDED",
            revisionHistory: [],
            dailyEntries: entries(12, null),
          },
        ],
      }),
    ] as never);
    const [row] = await getComplianceRows({ kind: "department", semesterId: "sem-1" }, NOW);
    expect(row.confirmedHours).toBe(12);
    expect(row.hoursPercent).toBe(100);
    expect(row.status).toBe("COMPLETED");
  });

  it("flags NEEDS_ATTENTION for an incomplete checklist or a missing due-week report", async () => {
    prismaMock.studentProfile.findMany.mockResolvedValue([
      profile({ id: "a", checklistItems: [{ status: "APPROVED" }, { status: "PENDING" }] }),
      profile({ id: "b" }), // full checklist but nothing for the due week
    ] as never);
    const rows = await getComplianceRows({ kind: "department", semesterId: "sem-1" }, NOW);
    expect(rows.map((r) => r.status)).toEqual(["NEEDS_ATTENTION", "NEEDS_ATTENTION"]);
  });

  it("returns [] without querying students when a faculty has no class-group pairs", async () => {
    prismaMock.facultyClassGroup.findMany.mockResolvedValue([] as never);
    const rows = await getComplianceRows({ kind: "faculty", facultyId: "f-1" }, NOW);
    expect(rows).toEqual([]);
    expect(prismaMock.studentProfile.findMany).not.toHaveBeenCalled();
  });

  it("scopes faculty to their (classGroupId, semesterId) pairs", async () => {
    prismaMock.facultyClassGroup.findMany.mockResolvedValue([
      { classGroupId: "cg-1", semesterId: "sem-1" },
      { classGroupId: "cg-2", semesterId: "sem-1" },
    ] as never);
    prismaMock.studentProfile.findMany.mockResolvedValue([] as never);
    await getComplianceRows({ kind: "faculty", facultyId: "f-1" }, NOW);
    const args = prismaMock.studentProfile.findMany.mock.calls[0][0] as { where: unknown };
    expect(args.where).toMatchObject({
      deletedAt: null,
      OR: [
        { classGroupId: "cg-1", semesterId: "sem-1" },
        { classGroupId: "cg-2", semesterId: "sem-1" },
      ],
    });
  });

  it("filters department scope by semester and program only (archived semesters stay readable)", async () => {
    prismaMock.studentProfile.findMany.mockResolvedValue([] as never);
    await getComplianceRows({ kind: "department", semesterId: "sem-old", program: "BSCS" }, NOW);
    const args = prismaMock.studentProfile.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({ deletedAt: null, semesterId: "sem-old", program: "BSCS" });
    expect(JSON.stringify(args.where)).not.toMatch(/archivedAt|isActive/);
  });
});

const row = (over: Partial<ComplianceRow>): ComplianceRow => ({
  studentProfileId: "s",
  studentNumber: "1",
  fullName: null,
  email: "e",
  program: "BSIT",
  classGroupId: "cg",
  classGroup: "G",
  company: "Acme",
  confirmedHours: 0,
  requiredHours: 486,
  hoursPercent: 0,
  checklistApproved: 9,
  checklistTotal: 9,
  dueWeekStart: "2026-10-05",
  dueWeekState: "APPROVED",
  awaitingReview: 0,
  status: "ON_TRACK",
  ...over,
});

const THREE: ComplianceRow[] = [
  row({ program: "BSIT", dueWeekState: "SUBMITTED", awaitingReview: 2, hoursPercent: 50 }),
  row({
    program: "BSIT",
    dueWeekState: "DRAFT",
    hoursPercent: 25,
    checklistApproved: 4,
    status: "NEEDS_ATTENTION",
  }),
  row({
    program: "BSCS",
    company: null,
    dueWeekState: "NOT_STARTED",
    hoursPercent: 0,
    checklistApproved: 0,
    status: "NOT_DEPLOYED",
  }),
];

describe("summarize", () => {
  it("counts submitted, pending review and not-yet-submitted (deployed only)", () => {
    expect(summarize(THREE)).toEqual({
      total: 3,
      submittedThisWeek: 1,
      pendingReview: 2,
      notYetSubmitted: 1, // the undeployed NOT_STARTED student is excluded
    });
  });

  it("handles no rows", () => {
    expect(summarize([])).toEqual({
      total: 0,
      submittedThisWeek: 0,
      pendingReview: 0,
      notYetSubmitted: 0,
    });
  });
});

describe("summarizeByProgram", () => {
  it("groups per program with averages", () => {
    const out = summarizeByProgram(THREE);
    expect(out.find((p) => p.program === "BSIT")).toEqual({
      program: "BSIT",
      students: 2,
      deployed: 2,
      avgHoursPercent: 38, // round((50 + 25) / 2)
      checklistComplete: 1,
      needsAttention: 1,
    });
    expect(out.find((p) => p.program === "BSCS")).toEqual({
      program: "BSCS",
      students: 1,
      deployed: 0,
      avgHoursPercent: 0,
      checklistComplete: 0,
      needsAttention: 0,
    });
  });
});

describe("resolveDepartmentSemester", () => {
  it("returns null when no semester is active", async () => {
    prismaMock.semester.findFirst.mockResolvedValue(null as never);
    expect(await resolveDepartmentSemester()).toBeNull();
    expect(prismaMock.semester.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    );
  });

  it("returns an archived semester when asked for it by id", async () => {
    const archived = { id: "sem-old", name: "AY25 T2", archivedAt: new Date("2026-06-01") };
    prismaMock.semester.findUnique.mockResolvedValue(archived as never);
    expect(await resolveDepartmentSemester("sem-old")).toEqual(archived);
  });

  it("returns null for an unknown id", async () => {
    prismaMock.semester.findUnique.mockResolvedValue(null as never);
    expect(await resolveDepartmentSemester("nope")).toBeNull();
  });
});

describe("resolveComplianceScope", () => {
  it("refuses students", async () => {
    await expect(resolveComplianceScope({ id: "u-1", role: "STUDENT_INTERN" }, {})).rejects.toThrow(
      ForbiddenError
    );
  });

  it("gives faculty their own scope and ignores semester and program params", async () => {
    const scope = await resolveComplianceScope(
      { id: "f-1", role: "FACULTY_ADVISER" },
      { semesterId: "sem-x", program: "BSCS" }
    );
    expect(scope).toEqual({ kind: "faculty", facultyId: "f-1" });
    expect(prismaMock.semester.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.semester.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for a coordinator when there is no active semester", async () => {
    prismaMock.semester.findFirst.mockResolvedValue(null as never);
    expect(
      await resolveComplianceScope({ id: "c-1", role: "DEPARTMENT_COORDINATOR" }, {})
    ).toBeNull();
  });

  it("gives a super admin department scope for the requested semester and passes program through", async () => {
    prismaMock.semester.findUnique.mockResolvedValue({
      id: "sem-old",
      name: "AY25 T2",
      archivedAt: new Date("2026-06-01"),
    } as never);
    expect(
      await resolveComplianceScope(
        { id: "a-1", role: "SUPER_ADMIN" },
        { semesterId: "sem-old", program: "BSIT" }
      )
    ).toEqual({ kind: "department", semesterId: "sem-old", program: "BSIT" });
  });

  it("omits program from department scope when none is given", async () => {
    prismaMock.semester.findFirst.mockResolvedValue({
      id: "sem-1",
      name: "T1",
      archivedAt: null,
    } as never);
    expect(await resolveComplianceScope({ id: "c-1", role: "DEPARTMENT_COORDINATOR" }, {})).toEqual(
      {
        kind: "department",
        semesterId: "sem-1",
      }
    );
  });
});
