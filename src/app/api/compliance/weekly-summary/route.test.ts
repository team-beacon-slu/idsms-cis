/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/complianceService", () => ({
  resolveComplianceScope: jest.fn(),
  getWeeklySummaryRows: jest.fn(),
}));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ storage: {} })) }));

import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { requireUserApi } from "@/lib/auth/session";
import { getWeeklySummaryRows, resolveComplianceScope } from "@/lib/services/complianceService";
import { GET } from "@/app/api/compliance/weekly-summary/route";

type SummaryRow = Awaited<ReturnType<typeof getWeeklySummaryRows>>[number];

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const row = (over: Partial<SummaryRow> = {}): SummaryRow => ({
  studentNumber: "2021-0001",
  fullName: "Ana Cruz",
  program: "BSIT",
  classGroup: "BSIT 4A",
  state: "APPROVED",
  hours: 20,
  submittedAt: "2026-10-12 13:05",
  late: false,
  ...over,
});

const request = (query = "") =>
  new NextRequest(`http://localhost/api/compliance/weekly-summary${query}`);

const readBook = async (res: Response) =>
  XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });

const asUser = (role: string, id = "u-1") =>
  (requireUserApi as jest.Mock).mockResolvedValue({ id, role });

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers().setSystemTime(new Date("2026-10-12T00:00:00Z")); // Mon 08:00 Manila
});
afterEach(() => jest.useRealTimers());

it("exports Summary and Students sheets for a faculty adviser's own students", async () => {
  asUser("FACULTY_ADVISER", "f-1");
  (resolveComplianceScope as jest.Mock).mockResolvedValue({ kind: "faculty", facultyId: "f-1" });
  (getWeeklySummaryRows as jest.Mock).mockResolvedValue([
    row(),
    row({ studentNumber: "2021-0002", state: "NOT_STARTED", hours: 0, submittedAt: null }),
  ]);

  const res = await GET(
    request("?weekStart=2026-10-05&semesterId=22222222-2222-4222-8222-222222222222&program=BSCS")
  );

  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe(XLSX_TYPE);
  expect(res.headers.get("Content-Disposition")).toMatch(
    /^attachment; filename="idsms-weekly-summary-2026-10-05-\d{4}-\d{2}-\d{2}\.xlsx"$/
  );
  expect(getWeeklySummaryRows).toHaveBeenCalledWith(
    { kind: "faculty", facultyId: "f-1" },
    new Date("2026-10-05T00:00:00Z")
  );

  const wb = await readBook(res);
  expect(wb.SheetNames).toEqual(["Summary", "Students"]);
  const students = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Students);
  expect(students[0]).toEqual({
    "Student number": "2021-0001",
    Name: "Ana Cruz",
    Program: "BSIT",
    "Class group": "BSIT 4A",
    "Report status": "APPROVED",
    Hours: 20,
    "Submitted at": "2026-10-12 13:05",
    Late: "No",
  });
  expect(students[1]).toMatchObject({
    "Report status": "NOT_STARTED",
    Hours: 0,
    "Submitted at": "",
  });
});

it("summary counts by state, late submissions and total hours match the rows", async () => {
  asUser("DEPARTMENT_COORDINATOR");
  (resolveComplianceScope as jest.Mock).mockResolvedValue({ kind: "department", semesterId: "s1" });
  (getWeeklySummaryRows as jest.Mock).mockResolvedValue([
    row({ hours: 20 }),
    row({ state: "SUBMITTED", hours: 12.5, late: true }),
    row({ state: "SUBMITTED", hours: 8 }),
    row({ state: "NOT_STARTED", hours: 0, submittedAt: null }),
  ]);

  const wb = await readBook(await GET(request("?weekStart=2026-10-05")));
  const summary = Object.fromEntries(
    XLSX.utils
      .sheet_to_json<Record<string, unknown>>(wb.Sheets.Summary)
      .map((r) => [r.Measure, r.Value])
  );

  expect(summary).toMatchObject({
    "Week starting": "2026-10-05",
    Students: 4,
    "Total hours": 40.5,
    "Late submissions": 1,
    "Not started": 1,
    Draft: 0,
    Submitted: 2,
    Returned: 0,
    Approved: 1,
    Regarded: 0,
    Disregarded: 0,
  });
});

it("gives a coordinator the department scope with the semester and program filters", async () => {
  asUser("DEPARTMENT_COORDINATOR", "c-1");
  (resolveComplianceScope as jest.Mock).mockResolvedValue({
    kind: "department",
    semesterId: "11111111-1111-4111-8111-111111111111",
    program: "BSIT",
  });
  (getWeeklySummaryRows as jest.Mock).mockResolvedValue([]);

  const res = await GET(
    request("?weekStart=2026-10-05&semesterId=11111111-1111-4111-8111-111111111111&program=BSIT")
  );

  expect(res.status).toBe(200);
  expect(resolveComplianceScope).toHaveBeenCalledWith(
    { id: "c-1", role: "DEPARTMENT_COORDINATOR" },
    { semesterId: "11111111-1111-4111-8111-111111111111", program: "BSIT" }
  );
});

it("defaults weekStart to the due week (Monday of the last fully-ended Manila week)", async () => {
  asUser("DEPARTMENT_COORDINATOR");
  (resolveComplianceScope as jest.Mock).mockResolvedValue({ kind: "department", semesterId: "s1" });
  (getWeeklySummaryRows as jest.Mock).mockResolvedValue([]);

  const res = await GET(request());

  expect(getWeeklySummaryRows).toHaveBeenCalledWith(
    { kind: "department", semesterId: "s1" },
    new Date("2026-10-05T00:00:00Z")
  );
  expect(res.headers.get("Content-Disposition")).toContain("idsms-weekly-summary-2026-10-05-");
});

it("keeps formula-like student text inert in the Students sheet", async () => {
  asUser("FACULTY_ADVISER", "f-1");
  (resolveComplianceScope as jest.Mock).mockResolvedValue({ kind: "faculty", facultyId: "f-1" });
  (getWeeklySummaryRows as jest.Mock).mockResolvedValue([
    row({ fullName: '=HYPERLINK("http://x")' }),
  ]);

  const wb = await readBook(await GET(request("?weekStart=2026-10-05")));
  const [first] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Students);

  expect(first.Name).toBe('\'=HYPERLINK("http://x")');
});

it.each(["2026-10-06", "2026-10-11", "not-a-date", "2026-02-30", "2026-10-5", "20261005"])(
  "rejects weekStart=%s (not a YYYY-MM-DD Monday) with 400",
  async (weekStart) => {
    asUser("DEPARTMENT_COORDINATOR");

    const res = await GET(request(`?weekStart=${weekStart}`));

    expect(res.status).toBe(400);
    expect(resolveComplianceScope).not.toHaveBeenCalled();
    expect(getWeeklySummaryRows).not.toHaveBeenCalled();
  }
);

it("rejects an unknown program with 400", async () => {
  asUser("DEPARTMENT_COORDINATOR");

  const res = await GET(request("?program=XYZ"));

  expect(res.status).toBe(400);
});

it("answers 404 when a coordinator has no active semester", async () => {
  asUser("DEPARTMENT_COORDINATOR");
  (resolveComplianceScope as jest.Mock).mockResolvedValue(null);

  const res = await GET(request("?weekStart=2026-10-05"));

  expect(res.status).toBe(404);
  await expect(res.json()).resolves.toEqual({ error: "No active semester" });
  expect(getWeeklySummaryRows).not.toHaveBeenCalled();
});

it("refuses students at the route with the requireRole rejection (401)", async () => {
  asUser("STUDENT_INTERN", "s-1");

  const res = await GET(request("?weekStart=2026-10-05"));

  expect(res.status).toBe(401);
  await expect(res.json()).resolves.toEqual({ error: "Insufficient role" });
  expect(resolveComplianceScope).not.toHaveBeenCalled();
  expect(getWeeklySummaryRows).not.toHaveBeenCalled();
});

it("rejects a non-UUID semesterId with 400 instead of a 500", async () => {
  asUser("DEPARTMENT_COORDINATOR");

  const res = await GET(request("?semesterId=not-a-uuid"));

  expect(res.status).toBe(400);
  expect(resolveComplianceScope).not.toHaveBeenCalled();
});
