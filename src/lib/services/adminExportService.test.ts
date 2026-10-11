jest.mock("@/lib/services/complianceService", () => ({
  ...jest.requireActual("@/lib/services/complianceService"),
  getComplianceRows: jest.fn(),
}));
jest.mock("@/lib/services/semesterService", () => ({ listSemesters: jest.fn() }));

import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { getComplianceRows, type ComplianceRow } from "@/lib/services/complianceService";
import { listSemesters } from "@/lib/services/semesterService";
import { buildAdminExport, isExportKind, EXPORT_KINDS } from "@/lib/services/adminExportService";

beforeEach(() => {
  resetPrismaMock();
  (getComplianceRows as jest.Mock).mockReset();
  (listSemesters as jest.Mock).mockReset();
});

const crow = (over: Partial<ComplianceRow> = {}): ComplianceRow => ({
  studentProfileId: "sp-1",
  studentNumber: "2021-0001",
  fullName: "Ana Cruz",
  email: "ana@slu.edu.ph",
  program: "BSIT",
  classGroupId: "cg-1",
  classGroup: "BSIT 4A",
  company: "Acme",
  confirmedHours: 10,
  requiredHours: 486,
  hoursPercent: 2,
  checklistApproved: 3,
  checklistTotal: 9,
  dueWeekStart: "2026-10-05",
  dueWeekState: "DRAFT",
  awaitingReview: 0,
  status: "ON_TRACK",
  ...over,
});

it("recognises only the six export kinds", () => {
  expect(EXPORT_KINDS).toHaveLength(6);
  expect(isExportKind("users")).toBe(true);
  expect(isExportKind("nope")).toBe(false);
});

describe("users", () => {
  it("never selects hashedPassword and emits no password-ish column", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        email: "a@slu.edu.ph",
        role: "FACULTY_ADVISER",
        isActive: true,
        lockedUntil: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ] as never);

    const out = await buildAdminExport("users");

    const args = prismaMock.user.findMany.mock.calls[0][0] as {
      select: Record<string, boolean>;
      where: unknown;
    };
    expect(args.select.hashedPassword).toBeUndefined();
    expect(args.where).toEqual({ deletedAt: null });
    const [sheet] = out.sheets;
    expect(sheet.name).toBe("Users");
    expect(Object.keys(sheet.rows[0]).some((k) => /password/i.test(k))).toBe(false);
    expect(sheet.rows[0]).toEqual({
      Email: "a@slu.edu.ph",
      Role: "FACULTY_ADVISER",
      Active: "Yes",
      "Locked until": "",
      Created: "2026-01-01 08:00",
      Updated: "2026-01-02 08:00",
    });
    expect(out.rowCount).toBe(1);
  });
});

describe("students", () => {
  it("loops every semester when none is given and adds a Semester column", async () => {
    (listSemesters as jest.Mock).mockResolvedValue([
      { id: "s1", name: "1st Sem" },
      { id: "s2", name: "2nd Sem" },
    ]);
    (getComplianceRows as jest.Mock)
      .mockResolvedValueOnce([crow()])
      .mockResolvedValueOnce([crow({ studentNumber: "2021-0002" })]);

    const out = await buildAdminExport("students");

    expect(getComplianceRows).toHaveBeenCalledTimes(2);
    expect((getComplianceRows as jest.Mock).mock.calls[0][0]).toEqual({
      kind: "department",
      semesterId: "s1",
    });
    expect(out.sheets[0].name).toBe("Students");
    expect(out.sheets[0].columns).toContain("Semester");
    expect(out.sheets[0].rows.map((r) => r.Semester)).toEqual(["1st Sem", "2nd Sem"]);
    expect(out.sheets[0].rows[0]["Checklist approved"]).toBe("3/9");
    expect(out.rowCount).toBe(2);
  });

  it("exports one semester without the Semester column", async () => {
    (getComplianceRows as jest.Mock).mockResolvedValue([crow()]);

    const out = await buildAdminExport("students", "s9");

    expect(listSemesters).not.toHaveBeenCalled();
    expect(getComplianceRows).toHaveBeenCalledTimes(1);
    expect(out.sheets[0].columns).not.toContain("Semester");
  });
});

describe("attendance", () => {
  it("filters through the student's semester and orders by student number then date", async () => {
    prismaMock.dailyReportEntry.findMany.mockResolvedValue([
      {
        reportDate: new Date("2026-10-05T00:00:00Z"),
        attendanceStatus: "PRESENT",
        timeIn: "08:00",
        timeOut: "17:00",
        scheduledHours: 8,
        actualHours: 8,
        weeklyReport: { studentProfile: { studentNumber: "2021-0001" } },
      },
    ] as never);

    const out = await buildAdminExport("attendance", "s1");

    const args = prismaMock.dailyReportEntry.findMany.mock.calls[0][0] as {
      where: unknown;
      orderBy: unknown;
    };
    expect(args.where).toEqual({ weeklyReport: { studentProfile: { semesterId: "s1" } } });
    expect(args.orderBy).toEqual([
      { weeklyReport: { studentProfile: { studentNumber: "asc" } } },
      { reportDate: "asc" },
    ]);
    expect(out.sheets[0].name).toBe("Attendance");
    expect(out.sheets[0].rows[0]).toEqual({
      "Student number": "2021-0001",
      Date: "2026-10-05",
      Status: "PRESENT",
      "Time in": "08:00",
      "Time out": "17:00",
      "Scheduled hours": 8,
      "Actual hours": 8,
    });
  });

  it("applies no semester filter when none is given", async () => {
    prismaMock.dailyReportEntry.findMany.mockResolvedValue([] as never);
    await buildAdminExport("attendance");
    const args = prismaMock.dailyReportEntry.findMany.mock.calls[0][0] as { where: unknown };
    expect(args.where).toEqual({});
  });
});

describe("reports", () => {
  it("derives submitted-at from revisionHistory and matches the reference code by week", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      {
        studentProfileId: "sp-1",
        weekStart: new Date("2026-10-05T00:00:00Z"),
        status: "APPROVED",
        totalHours: 40,
        facultyAction: "Good",
        revisionHistory: [
          { type: "SUBMITTED", timestamp: "2026-10-12T01:00:00.000Z" },
          { type: "RETURNED", timestamp: "2026-10-13T01:00:00.000Z" },
          { type: "SUBMITTED", timestamp: "2026-10-14T02:30:00.000Z" },
        ],
        studentProfile: { studentNumber: "2021-0001" },
      },
      {
        studentProfileId: "sp-1",
        weekStart: new Date("2026-10-12T00:00:00Z"),
        status: "PENDING",
        totalHours: 0,
        facultyAction: null,
        revisionHistory: [],
        studentProfile: { studentNumber: "2021-0001" },
      },
    ] as never);
    prismaMock.generatedDocument.findMany.mockResolvedValue([
      {
        studentProfileId: "sp-1",
        documentType: "WEEKLY_REPORT",
        periodLabel: "2026-10-05",
        referenceCode: "WR-1",
        status: "FINAL",
        studentProfile: { studentNumber: "2021-0001" },
      },
      {
        studentProfileId: "sp-1",
        documentType: "MONTHLY_REPORT",
        periodLabel: "2026-09",
        referenceCode: "MR-1",
        status: "FINAL",
        studentProfile: { studentNumber: "2021-0001" },
      },
    ] as never);

    const out = await buildAdminExport("reports");

    expect(out.sheets.map((s) => s.name)).toEqual(["Weekly reports", "Monthly reports"]);
    const [w1, w2] = out.sheets[0].rows;
    expect(w1["Submitted at"]).toBe("2026-10-14 10:30");
    expect(w1["Reference code"]).toBe("WR-1");
    expect(w1["Week start"]).toBe("2026-10-05");
    expect(w2["Submitted at"]).toBe("");
    expect(w2["Reference code"]).toBe("");
    expect(out.sheets[1].rows).toEqual([
      {
        "Student number": "2021-0001",
        Period: "2026-09",
        Status: "FINAL",
        "Reference code": "MR-1",
      },
    ]);
    expect(out.rowCount).toBe(3);
  });
});

describe("checklist", () => {
  it("never selects or emits filePath", async () => {
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue([
      {
        requirementType: "RESUME",
        status: "APPROVED",
        reviewDate: new Date("2026-10-01T00:00:00Z"),
        comments: "ok",
        studentProfile: { studentNumber: "2021-0001" },
        reviewer: { email: "f@slu.edu.ph" },
      },
    ] as never);

    const out = await buildAdminExport("checklist");

    const args = prismaMock.preDeploymentChecklistItem.findMany.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(args.select.filePath).toBeUndefined();
    expect(Object.keys(out.sheets[0].rows[0])).toEqual([
      "Student number",
      "Requirement",
      "Status",
      "Reviewer email",
      "Reviewed at",
      "Comments",
    ]);
    expect(out.sheets[0].rows[0]["Reviewer email"]).toBe("f@slu.edu.ph");
  });
});

describe("companies", () => {
  it("asks for the latest non-archived MOA and reports it", async () => {
    prismaMock.company.findMany.mockResolvedValue([
      {
        name: "Acme",
        address: "Baguio",
        workModality: "ONSITE",
        supervisorName: "Sup",
        supervisorPosition: null,
        isVerified: true,
        moaRecords: [{ status: "ACTIVE", validTo: new Date("2027-06-30T00:00:00Z") }],
      },
      {
        name: "NoMoa",
        address: "x",
        workModality: "REMOTE",
        supervisorName: "S",
        supervisorPosition: "Mgr",
        isVerified: false,
        moaRecords: [],
      },
    ] as never);

    const out = await buildAdminExport("companies");

    const args = prismaMock.company.findMany.mock.calls[0][0] as {
      where: unknown;
      select: { moaRecords: unknown };
    };
    expect(args.where).toEqual({ deletedAt: null });
    expect(args.select.moaRecords).toMatchObject({
      where: { archivedAt: null },
      orderBy: { validTo: "desc" },
      take: 1,
    });
    expect(out.sheets[0].rows[0]).toMatchObject({
      Company: "Acme",
      Verified: "Yes",
      "MOA status": "ACTIVE",
      "MOA valid to": "2027-06-30",
    });
    expect(out.sheets[0].rows[1]).toMatchObject({ "MOA status": "", "MOA valid to": "" });
  });
});
