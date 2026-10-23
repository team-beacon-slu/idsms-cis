/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/accounts/auditLogQuery", () => ({
  ...jest.requireActual("@/lib/services/accounts/auditLogQuery"),
  queryAuditLogs: jest.fn(),
}));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ storage: {} })) }));

import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { requireUserApi } from "@/lib/auth/session";
import { UnauthorizedError } from "@/lib/auth/errors";
import { queryAuditLogs } from "@/lib/services/accounts/auditLogQuery";
import { GET } from "@/app/api/audit-logs/export/route";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const logRow = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  timestamp: new Date("2026-10-11T16:30:00.000Z"),
  action: "SEMESTER_ACTIVATED",
  entityType: "Semester",
  entityId: "s1",
  email: "admin@slu.edu.ph",
  name: "Maria Santos",
  ipAddress: "10.0.0.1",
  detail: { semesterId: "s1" },
  ...over,
});

const request = (query = "") => new NextRequest(`http://localhost/api/audit-logs/export${query}`);

const asAdmin = () =>
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "u-1", role: "SUPER_ADMIN" });

const readBook = async (res: Response) =>
  XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });

beforeEach(() => jest.resetAllMocks());

it("exports audit rows for a Super Admin with Manila timestamps", async () => {
  asAdmin();
  (queryAuditLogs as jest.Mock).mockResolvedValue({ rows: [logRow()], total: 1 });

  const res = await GET(request("?action=SEMESTER_ACTIVATED&from=2026-10-01"));

  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe(XLSX_TYPE);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(res.headers.get("Content-Disposition")).toMatch(
    /^attachment; filename="idsms-audit-log-\d{4}-\d{2}-\d{2}\.xlsx"$/
  );
  expect(queryAuditLogs).toHaveBeenCalledWith(
    expect.objectContaining({ action: "SEMESTER_ACTIVATED", page: 1 }),
    { max: 10_000 }
  );
  const wb = await readBook(res);
  expect(wb.SheetNames).toEqual(["Audit log"]);
  const [first] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Audit log"]);
  expect(first).toEqual({
    Timestamp: "2026-10-12 00:30",
    "User email": "admin@slu.edu.ph",
    "User name": "Maria Santos",
    Action: "SEMESTER_ACTIVATED",
    "Entity type": "Semester",
    "Entity id": "s1",
    "IP address": "10.0.0.1",
    Detail: '{"semesterId":"s1"}',
  });
});

it("keeps a formula-like detail string inert", async () => {
  asAdmin();
  (queryAuditLogs as jest.Mock).mockResolvedValue({
    rows: [logRow({ detail: "=cmd|' /C calc'!A0" })],
    total: 1,
  });

  const wb = await readBook(await GET(request()));
  const [first] = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets["Audit log"]);

  expect(first.Detail.startsWith("'")).toBe(true);
  expect(first.Detail).toBe("'=cmd|' /C calc'!A0");
});

it("cuts Detail to 2,000 characters", async () => {
  asAdmin();
  (queryAuditLogs as jest.Mock).mockResolvedValue({
    rows: [logRow({ detail: "x".repeat(5000) })],
    total: 1,
  });

  const wb = await readBook(await GET(request()));
  const [first] = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets["Audit log"]);

  expect(first.Detail).toHaveLength(2000);
});

it("adds a Notes sheet when the export is truncated", async () => {
  asAdmin();
  (queryAuditLogs as jest.Mock).mockResolvedValue({ rows: [logRow()], total: 10_001 });

  const wb = await readBook(await GET(request()));

  expect(wb.SheetNames).toEqual(["Audit log", "Notes"]);
  const notes = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Notes);
  expect(notes[0].Note).toContain("10000");
  expect(notes[0].Note).toContain("10001");
});

it("refuses a coordinator with 401 before querying", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });

  const res = await GET(request());

  expect(res.status).toBe(401);
  expect(queryAuditLogs).not.toHaveBeenCalled();
});

it("answers 401 when not signed in", async () => {
  (requireUserApi as jest.Mock).mockRejectedValue(new UnauthorizedError());

  const res = await GET(request());

  expect(res.status).toBe(401);
});

it("rejects an invalid date with 400", async () => {
  asAdmin();

  const res = await GET(request("?from=notadate"));

  expect(res.status).toBe(400);
  expect(queryAuditLogs).not.toHaveBeenCalled();
});
