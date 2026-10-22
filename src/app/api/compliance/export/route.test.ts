/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/complianceService", () => ({
  ...jest.requireActual("@/lib/services/complianceService"),
  resolveComplianceScope: jest.fn(),
  getComplianceRows: jest.fn(),
}));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ storage: {} })) }));

import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { requireUserApi } from "@/lib/auth/session";
import {
  getComplianceRows,
  resolveComplianceScope,
  type ComplianceRow,
} from "@/lib/services/complianceService";
import { GET } from "@/app/api/compliance/export/route";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const row = (over: Partial<ComplianceRow> = {}): ComplianceRow => ({
  studentProfileId: "sp-1",
  studentNumber: "2021-0001",
  fullName: "Ana Cruz",
  email: "ana@slu.edu.ph",
  program: "BSIT",
  classGroupId: "cg-1",
  classGroup: "BSIT 4A",
  company: "Acme",
  confirmedHours: 243,
  requiredHours: 486,
  hoursPercent: 50,
  checklistApproved: 9,
  checklistTotal: 9,
  dueWeekStart: "2026-10-05",
  dueWeekState: "APPROVED",
  awaitingReview: 0,
  status: "ON_TRACK",
  recentWeeks: [],
  ...over,
});

const request = (query = "") => new NextRequest(`http://localhost/api/compliance/export${query}`);

const readSheet = async (res: Response) => {
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  expect(wb.SheetNames).toEqual(["Compliance"]);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Compliance);
};

beforeEach(() => jest.resetAllMocks());

it("exports a faculty adviser's own students as xlsx", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "f-1", role: "FACULTY_ADVISER" });
  (resolveComplianceScope as jest.Mock).mockResolvedValue({ kind: "faculty", facultyId: "f-1" });
  (getComplianceRows as jest.Mock).mockResolvedValue([row()]);

  const res = await GET(request("?semesterId=22222222-2222-4222-8222-222222222222&program=BSCS"));

  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe(XLSX_TYPE);
  expect(res.headers.get("Content-Disposition")).toMatch(
    /^attachment; filename="idsms-compliance-\d{4}-\d{2}-\d{2}\.xlsx"$/
  );
  expect(getComplianceRows).toHaveBeenCalledWith({ kind: "faculty", facultyId: "f-1" });
  const [first] = await readSheet(res);
  expect(first).toEqual({
    "Student number": "2021-0001",
    Name: "Ana Cruz",
    Email: "ana@slu.edu.ph",
    Program: "BSIT",
    "Class group": "BSIT 4A",
    Company: "Acme",
    "Confirmed hours": 243,
    "Required hours": 486,
    "Hours %": 50,
    "Checklist approved": "9/9",
    "Due-week report": "APPROVED",
    "Awaiting review": 0,
    Status: "ON_TRACK",
  });
});

it("gives a coordinator the department scope, program filter and status filter", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });
  (resolveComplianceScope as jest.Mock).mockResolvedValue({
    kind: "department",
    semesterId: "11111111-1111-4111-8111-111111111111",
    program: "BSIT",
  });
  (getComplianceRows as jest.Mock).mockResolvedValue([
    row({ studentNumber: "2021-0001", status: "NEEDS_ATTENTION" }),
    row({ studentNumber: "2021-0002", status: "ON_TRACK" }),
  ]);

  const res = await GET(
    request("?semesterId=11111111-1111-4111-8111-111111111111&program=BSIT&status=NEEDS_ATTENTION")
  );

  expect(res.status).toBe(200);
  expect(resolveComplianceScope).toHaveBeenCalledWith(
    { id: "c-1", role: "DEPARTMENT_COORDINATOR" },
    { semesterId: "11111111-1111-4111-8111-111111111111", program: "BSIT" }
  );
  expect(getComplianceRows).toHaveBeenCalledWith({
    kind: "department",
    semesterId: "11111111-1111-4111-8111-111111111111",
    program: "BSIT",
  });
  const rows = await readSheet(res);
  expect(rows.map((r) => r["Student number"])).toEqual(["2021-0001"]);
});

it("keeps formula-like student text inert in the sheet", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "f-1", role: "FACULTY_ADVISER" });
  (resolveComplianceScope as jest.Mock).mockResolvedValue({ kind: "faculty", facultyId: "f-1" });
  (getComplianceRows as jest.Mock).mockResolvedValue([row({ fullName: '=HYPERLINK("http://x")' })]);

  const [first] = await readSheet(await GET(request()));

  expect(first.Name).toBe('\'=HYPERLINK("http://x")');
});

it("answers 404 when a coordinator has no active semester", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });
  (resolveComplianceScope as jest.Mock).mockResolvedValue(null);

  const res = await GET(request());

  expect(res.status).toBe(404);
  await expect(res.json()).resolves.toEqual({ error: "No active semester" });
  expect(getComplianceRows).not.toHaveBeenCalled();
});

it("refuses students at the route with the requireRole rejection (401)", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "s-1", role: "STUDENT_INTERN" });

  const res = await GET(request());

  expect(res.status).toBe(401);
  await expect(res.json()).resolves.toEqual({ error: "Insufficient role" });
  expect(resolveComplianceScope).not.toHaveBeenCalled();
  expect(getComplianceRows).not.toHaveBeenCalled();
});

it("rejects a non-UUID semesterId with 400 instead of a 500", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });

  const res = await GET(request("?semesterId=not-a-uuid"));

  expect(res.status).toBe(400);
  expect(resolveComplianceScope).not.toHaveBeenCalled();
});

it("shows the approved count over the 9 required items, even with no checklist rows", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });
  (resolveComplianceScope as jest.Mock).mockResolvedValue({ kind: "department", semesterId: "s1" });
  (getComplianceRows as jest.Mock).mockResolvedValue([
    row({ checklistApproved: 0, checklistTotal: 9 }),
  ]);

  const [first] = await readSheet(await GET(request()));

  expect(first["Checklist approved"]).toBe("0/9");
});

it("rejects an unknown program with 400", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });

  const res = await GET(request("?program=XYZ"));

  expect(res.status).toBe(400);
  expect(resolveComplianceScope).not.toHaveBeenCalled();
});

it("rejects an unknown status with 400", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });

  const res = await GET(request("?status=BOGUS"));

  expect(res.status).toBe(400);
});
