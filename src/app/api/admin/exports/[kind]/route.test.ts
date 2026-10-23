/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/auth/confirmPassword", () => ({ confirmPassword: jest.fn() }));
jest.mock("@/lib/services/accounts/auditService", () => ({ logEvent: jest.fn() }));
jest.mock("@/lib/services/privacy/adminExportService", () => ({
  ...jest.requireActual("@/lib/services/privacy/adminExportService"),
  buildAdminExport: jest.fn(),
}));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ storage: {} })) }));

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUserApi } from "@/lib/auth/session";
import { confirmPassword } from "@/lib/auth/confirmPassword";
import { logEvent } from "@/lib/services/accounts/auditService";
import { buildAdminExport } from "@/lib/services/privacy/adminExportService";
import { POST } from "@/app/api/admin/exports/[kind]/route";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const admin = { id: "a-1", email: "admin@slu.edu.ph", role: "SUPER_ADMIN" };
const SEM = "11111111-1111-4111-8111-111111111111";

const call = (kind: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/admin/exports/${kind}`, {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ kind }) }
  );

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue(admin);
  (confirmPassword as jest.Mock).mockResolvedValue(null);
  (buildAdminExport as jest.Mock).mockResolvedValue({
    sheets: [
      {
        name: "Users",
        columns: ["Email", "Role"],
        rows: [{ Email: "a@slu.edu.ph", Role: "FACULTY_ADVISER" }],
      },
    ],
    rowCount: 1,
  });
});

it("refuses a coordinator with 401 before building anything", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ ...admin, role: "DEPARTMENT_COORDINATOR" });

  const res = await call("users", { password: "pw" });

  expect(res.status).toBe(401);
  expect(confirmPassword).not.toHaveBeenCalled();
  expect(buildAdminExport).not.toHaveBeenCalled();
});

it("answers 401 on a wrong password without building or logging", async () => {
  (confirmPassword as jest.Mock).mockResolvedValue(
    NextResponse.json({ error: "Password confirmation failed" }, { status: 401 })
  );

  const res = await call("users", { password: "bad" });

  expect(res.status).toBe(401);
  expect(confirmPassword).toHaveBeenCalledWith(admin, "bad", "10.0.0.1");
  expect(buildAdminExport).not.toHaveBeenCalled();
  expect(logEvent).not.toHaveBeenCalled();
});

it("answers 423 for a locked account without building or logging", async () => {
  (confirmPassword as jest.Mock).mockResolvedValue(
    NextResponse.json(
      { error: "Too many failed attempts — try again after 3:00 PM" },
      { status: 423 }
    )
  );

  const res = await call("users", { password: "bad" });

  expect(res.status).toBe(423);
  expect(buildAdminExport).not.toHaveBeenCalled();
  expect(logEvent).not.toHaveBeenCalled();
});

it("answers 404 for an unknown kind", async () => {
  const res = await call("secrets", { password: "pw" });

  expect(res.status).toBe(404);
  expect(confirmPassword).not.toHaveBeenCalled();
  expect(buildAdminExport).not.toHaveBeenCalled();
});

it("rejects a non-uuid semesterId with 400 before re-auth", async () => {
  const res = await call("attendance", { password: "pw", semesterId: "nope" });

  expect(res.status).toBe(400);
  expect(confirmPassword).not.toHaveBeenCalled();
  expect(buildAdminExport).not.toHaveBeenCalled();
});

it("returns the workbook and audits DATA_EXPORTED with the row count", async () => {
  const res = await call("users", { password: "pw", semesterId: SEM });

  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe(XLSX_TYPE);
  expect(res.headers.get("Content-Disposition")).toMatch(
    /^attachment; filename="idsms-export-users-\d{4}-\d{2}-\d{2}\.xlsx"$/
  );
  expect(buildAdminExport).toHaveBeenCalledWith("users", SEM);
  expect(logEvent).toHaveBeenCalledWith({
    userId: "a-1",
    action: "DATA_EXPORTED",
    entityType: "Export",
    ipAddress: "10.0.0.1",
    detail: { kind: "users", semesterId: SEM, rowCount: 1 },
  });
});

it("writes no audit row when the workbook cannot be built", async () => {
  (buildAdminExport as jest.Mock).mockResolvedValue({
    sheets: [
      { name: "Dup", columns: ["A"], rows: [] },
      { name: "Dup", columns: ["A"], rows: [] }, // xlsx rejects duplicate sheet names
    ],
    rowCount: 0,
  });

  const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  const res = await call("users", { password: "pw" });
  errSpy.mockRestore();

  expect(res.status).toBe(500);
  expect(logEvent).not.toHaveBeenCalled();
});

it("keeps formula-like student names inert in the students export", async () => {
  (buildAdminExport as jest.Mock).mockResolvedValue({
    sheets: [{ name: "Students", columns: ["Name"], rows: [{ Name: '=HYPERLINK("http://x")' }] }],
    rowCount: 1,
  });

  const res = await call("students", { password: "pw" });

  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  const [first] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Students);
  expect(first.Name).toBe('\'=HYPERLINK("http://x")');
  expect(logEvent).toHaveBeenCalledWith(
    expect.objectContaining({ detail: { kind: "students", semesterId: null, rowCount: 1 } })
  );
});
