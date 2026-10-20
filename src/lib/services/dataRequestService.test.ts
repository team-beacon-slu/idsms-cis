import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { logEvent } from "@/lib/services/auditService";
import {
  DSAR_SLA_DAYS,
  buildPersonalDataWorkbook,
  createDataRequest,
  getMyDataRequestSummary,
  listDataRequests,
  markDataRequestFulfilled,
} from "@/lib/services/dataRequestService";
import { DataRequestStateError, ComplianceNotFoundError } from "@/lib/errors/compliance";
import { getSuperAdminIds } from "@/lib/services/notificationRecipients";

jest.mock("@/lib/services/auditService", () => ({ logEvent: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(logEvent).mockReset();
});

describe("createDataRequest", () => {
  it("sets dueAt exactly 15 days after requestedAt and logs DSAR_REQUESTED with tx", async () => {
    const requestedAt = new Date("2026-10-12T02:00:00Z");
    prismaMock.dataRequest.findFirst.mockResolvedValue(null);
    prismaMock.dataRequest.create.mockImplementation((async (args: {
      data: { userId: string; requestedAt: Date; dueAt: Date };
    }) => ({ id: "r-1", ...args.data })) as never);

    const res = await createDataRequest("u-1", "10.0.0.1", requestedAt);

    expect(DSAR_SLA_DAYS).toBe(15);
    expect(res.dueAt.getTime() - requestedAt.getTime()).toBe(15 * DAY);
    expect(prismaMock.dataRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u-1", status: "OPEN" } })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        action: "DSAR_REQUESTED",
        entityType: "DataRequest",
        entityId: "r-1",
        ipAddress: "10.0.0.1",
      }),
      prismaMock
    );
  });

  it("refuses a second open request", async () => {
    prismaMock.dataRequest.findFirst.mockResolvedValue({
      dueAt: new Date("2026-10-27T00:00:00Z"),
    } as never);

    await expect(createDataRequest("u-1", null)).rejects.toThrow(DataRequestStateError);
    await expect(createDataRequest("u-1", null)).rejects.toThrow(
      "You already have an open request (due 2026-10-27)"
    );
    expect(prismaMock.dataRequest.create).not.toHaveBeenCalled();
  });

  it("maps a unique-index violation (concurrent request) to the friendly 409 without logging", async () => {
    prismaMock.dataRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ dueAt: new Date("2026-10-27T00:00:00Z") } as never);
    prismaMock.dataRequest.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    await expect(createDataRequest("u-1", null)).rejects.toThrow(
      new DataRequestStateError("You already have an open request (due 2026-10-27)")
    );
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the winner cannot be re-read", async () => {
    prismaMock.dataRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("boom"));
    prismaMock.dataRequest.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );
    await expect(createDataRequest("u-1", null)).rejects.toThrow(
      "You already have an open request"
    );
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("rethrows other create errors untouched", async () => {
    prismaMock.dataRequest.findFirst.mockResolvedValue(null);
    prismaMock.dataRequest.create.mockRejectedValue(new Error("db down"));
    await expect(createDataRequest("u-1", null)).rejects.toThrow("db down");
  });
});

describe("getMyDataRequestSummary", () => {
  it("scopes both lookups to the requester", async () => {
    prismaMock.dataRequest.findFirst
      .mockResolvedValueOnce({ dueAt: new Date("2026-10-27T00:00:00Z") } as never)
      .mockResolvedValueOnce({ fulfilledAt: new Date("2026-09-01T00:00:00Z") } as never);

    const res = await getMyDataRequestSummary("u-1");

    expect(res.open?.dueAt).toEqual(new Date("2026-10-27T00:00:00Z"));
    expect(res.lastFulfilledAt).toEqual(new Date("2026-09-01T00:00:00Z"));
    for (const call of prismaMock.dataRequest.findFirst.mock.calls) {
      expect(call[0]?.where).toEqual(expect.objectContaining({ userId: "u-1" }));
    }
  });
});

describe("listDataRequests", () => {
  it("orders open by dueAt asc and fulfilled last 10 by fulfilledAt desc", async () => {
    const d = new Date("2026-10-12T00:00:00Z");
    prismaMock.dataRequest.findMany
      .mockResolvedValueOnce([
        { id: "r-1", requestedAt: d, dueAt: d, user: { email: "a@x.ph" } },
      ] as never)
      .mockResolvedValueOnce([
        { id: "r-2", requestedAt: d, fulfilledAt: d, user: { email: "b@x.ph" } },
      ] as never);

    const res = await listDataRequests();

    expect(res.open[0]).toEqual({ id: "r-1", email: "a@x.ph", requestedAt: d, dueAt: d });
    expect(res.recentFulfilled[0]).toEqual({
      id: "r-2",
      email: "b@x.ph",
      requestedAt: d,
      fulfilledAt: d,
    });
    expect(prismaMock.dataRequest.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { status: "OPEN" }, orderBy: { dueAt: "asc" } })
    );
    expect(prismaMock.dataRequest.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { status: "FULFILLED" },
        orderBy: { fulfilledAt: "desc" },
        take: 10,
      })
    );
  });
});

describe("markDataRequestFulfilled", () => {
  it("throws not found for an unknown id", async () => {
    prismaMock.dataRequest.findUnique.mockResolvedValue(null);
    await expect(markDataRequestFulfilled("r-1", "a-1")).rejects.toThrow(ComplianceNotFoundError);
  });

  it("refuses a request that is not OPEN", async () => {
    prismaMock.dataRequest.findUnique.mockResolvedValue({
      id: "r-1",
      userId: "u-1",
      status: "FULFILLED",
    } as never);
    await expect(markDataRequestFulfilled("r-1", "a-1")).rejects.toThrow(
      "This request is already fulfilled"
    );
    expect(prismaMock.dataRequest.updateMany).not.toHaveBeenCalled();
  });

  it("marks fulfilled and logs DSAR_FULFILLED in the transaction", async () => {
    prismaMock.dataRequest.findUnique.mockResolvedValue({
      id: "r-1",
      userId: "u-1",
      status: "OPEN",
    } as never);
    prismaMock.dataRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await markDataRequestFulfilled("r-1", "a-1");

    expect(res).toEqual({ userId: "u-1" });
    expect(prismaMock.dataRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r-1", status: "OPEN" },
        data: expect.objectContaining({ status: "FULFILLED", fulfilledBy: "a-1" }),
      })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "a-1",
        action: "DSAR_FULFILLED",
        entityType: "DataRequest",
        entityId: "r-1",
      }),
      prismaMock
    );
  });

  it("loses a race gracefully when another fulfil already won", async () => {
    prismaMock.dataRequest.findUnique.mockResolvedValue({
      id: "r-1",
      userId: "u-1",
      status: "OPEN",
    } as never);
    prismaMock.dataRequest.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(markDataRequestFulfilled("r-1", "a-1")).rejects.toThrow(DataRequestStateError);
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe("buildPersonalDataWorkbook", () => {
  const SHEETS = [
    "Account",
    "Student profile",
    "Checklist",
    "Work plan",
    "Attendance",
    "Weekly reports",
    "Deviation reports",
    "Generated documents",
    "Notifications",
    "Activity",
  ];
  const created = new Date("2026-08-01T00:00:00Z");

  function mockCommon() {
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue([]);
    prismaMock.workPlan.findMany.mockResolvedValue([]);
    prismaMock.dailyReportEntry.findMany.mockResolvedValue([]);
    prismaMock.weeklyReport.findMany.mockResolvedValue([]);
    prismaMock.deviationReport.findMany.mockResolvedValue([]);
    prismaMock.generatedDocument.findMany.mockResolvedValue([]);
  }

  const studentUser = {
    email: "s@slu.edu.ph",
    role: "STUDENT_INTERN",
    isActive: true,
    createdAt: created,
    studentProfile: {
      id: "p-1",
      studentNumber: "2021-0001",
      program: "BSCS",
      classGroup: { name: "CS-4A" },
      semester: { name: "1st Sem" },
      company: { name: "Acme" },
      requiredHours: 486,
      fullName: "Juan Dela Cruz",
      positionTitle: "Intern",
    },
  };

  it("returns the 10 sheets in order with no password field", async () => {
    mockCommon();
    prismaMock.user.findUnique.mockResolvedValue(studentUser as never);

    const wb = await buildPersonalDataWorkbook("u-1");

    expect(wb.email).toBe("s@slu.edu.ph");
    expect(wb.sheets.map((s) => s.name)).toEqual(SHEETS);
    expect(wb.sheets[0].rows[0]).toEqual(["Email", "Role", "Active", "Created"]);
    expect(JSON.stringify(wb.sheets)).not.toMatch(/hashed|password|failedLogin/i);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u-1" } })
    );
  });

  it("scopes attendance to the requester's own weekly reports and neutralises formulas", async () => {
    mockCommon();
    prismaMock.user.findUnique.mockResolvedValue(studentUser as never);
    prismaMock.dailyReportEntry.findMany.mockResolvedValue([
      {
        reportDate: new Date("2026-09-01T00:00:00Z"),
        attendanceStatus: "PRESENT",
        timeIn: "08:00",
        timeOut: "17:00",
        actualHours: 8,
        accomplishments: '=HYPERLINK("http://x","click")',
        toolsUsed: "VS Code",
      },
    ] as never);

    const wb = await buildPersonalDataWorkbook("u-1");

    expect(prismaMock.dailyReportEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { weeklyReport: { studentProfileId: "p-1" } } })
    );
    const attendance = wb.sheets.find((s) => s.name === "Attendance")!;
    expect(attendance.rows[1]).toContain(`'=HYPERLINK("http://x","click")`);
    expect(attendance.rows[0]).toContain("Credited hours");
  });

  it("reports credited hours next to raw hours", async () => {
    mockCommon();
    prismaMock.user.findUnique.mockResolvedValue(studentUser as never);
    prismaMock.dailyReportEntry.findMany.mockResolvedValue([
      {
        reportDate: new Date("2026-09-01T00:00:00Z"),
        attendanceStatus: "PRESENT",
        timeIn: "07:00",
        timeOut: "17:00",
        scheduledHours: 8,
        actualHours: 9,
        creditedHours: null,
        accomplishments: "x",
        toolsUsed: null,
      },
    ] as never);

    const wb = await buildPersonalDataWorkbook("u-1");

    const attendance = wb.sheets.find((s) => s.name === "Attendance")!;
    const header = attendance.rows[0] as unknown[];
    const row = attendance.rows[1] as unknown[];
    expect(row[header.indexOf("Hours")]).toBe(9);
    expect(row[header.indexOf("Credited hours")]).toBe(8);
  });

  it("includes inferences and histories, keeping formula-like history text inert", async () => {
    mockCommon();
    prismaMock.user.findUnique.mockResolvedValue(studentUser as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      {
        weekStart: new Date("2026-09-01T00:00:00Z"),
        status: "SUBMITTED",
        totalHours: 40,
        facultyAction: null,
        sentimentLabel: "POSITIVE",
        sentimentConfidence: "0.912",
        similarityFlag: true,
        similarityScore: "0.850",
        revisionHistory: [{ note: "=SUM(A1)" }],
      },
      {
        weekStart: new Date("2026-09-08T00:00:00Z"),
        status: "DRAFT",
        totalHours: 0,
        facultyAction: null,
        sentimentLabel: null,
        sentimentConfidence: null,
        similarityFlag: false,
        similarityScore: null,
        revisionHistory: [],
      },
    ] as never);
    prismaMock.workPlan.findMany.mockResolvedValue([
      {
        status: "APPROVED",
        createdAt: created,
        plannedTasks: [],
        scheduleChangeHistory: [{ reason: "moved" }],
      },
    ] as never);

    const wb = await buildPersonalDataWorkbook("u-1");

    const weekly = wb.sheets.find((s) => s.name === "Weekly reports")!;
    expect(weekly.rows[0].slice(4)).toEqual([
      "Sentiment",
      "Sentiment confidence",
      "Similarity flagged",
      "Similarity score",
      "Submission history",
    ]);
    expect(weekly.rows[1].slice(4)).toEqual([
      "POSITIVE",
      0.912,
      "Yes",
      0.85,
      '[{"note":"=SUM(A1)"}]', // JSON text starts with "[", so the formula never leads a cell
    ]);
    expect(weekly.rows[2].slice(4)).toEqual(["", "", "No", "", "[]"]);
    const plan = wb.sheets.find((s) => s.name === "Work plan")!;
    expect(plan.rows[0]).toContain("Schedule changes");
    expect(plan.rows[1]).toContain('[{"reason":"moved"}]');
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentProfileId: "p-1" } })
    );
  });

  it("gives a user without a student profile header-only student sheets", async () => {
    prismaMock.notification.findMany.mockResolvedValue([
      { sentAt: created, triggerType: "X", payload: { title: "Hello" }, readAt: null },
    ] as never);
    prismaMock.auditLog.findMany.mockResolvedValue([
      { timestamp: created, action: "LOGIN", entityType: "User", ipAddress: "1.1.1.1" },
    ] as never);
    prismaMock.user.findUnique.mockResolvedValue({
      email: "f@slu.edu.ph",
      role: "FACULTY_ADVISER",
      isActive: true,
      createdAt: created,
      studentProfile: null,
    } as never);

    const wb = await buildPersonalDataWorkbook("u-2");

    expect(wb.sheets.map((s) => s.name)).toEqual(SHEETS);
    for (const name of SHEETS.slice(1, 8)) {
      expect(wb.sheets.find((s) => s.name === name)!.rows).toHaveLength(1);
    }
    expect(wb.sheets[0].rows).toHaveLength(2);
    expect(wb.sheets.find((s) => s.name === "Notifications")!.rows[1]).toContain("Hello");
    expect(wb.sheets.find((s) => s.name === "Activity")!.rows).toHaveLength(2);
    expect(prismaMock.dailyReportEntry.findMany).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u-2" } })
    );
  });

  it("throws not found when the user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(buildPersonalDataWorkbook("nope")).rejects.toThrow(ComplianceNotFoundError);
  });
});

describe("getSuperAdminIds", () => {
  it("returns active, non-deleted super admins", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "a-1" }, { id: "a-2" }] as never);
    await expect(getSuperAdminIds()).resolves.toEqual(["a-1", "a-2"]);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: "SUPER_ADMIN", isActive: true, deletedAt: null },
      })
    );
  });
});
