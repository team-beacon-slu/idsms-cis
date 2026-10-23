/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/auth/confirmPassword", () => ({ confirmPassword: jest.fn() }));
jest.mock("@/lib/services/accounts/auditService", () => ({ logEvent: jest.fn() }));
jest.mock("@/lib/services/privacy/dataRequestService", () => ({
  getDataRequestSubject: jest.fn(),
  buildPersonalDataWorkbook: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUserApi } from "@/lib/auth/session";
import { confirmPassword } from "@/lib/auth/confirmPassword";
import { ComplianceNotFoundError } from "@/lib/errors/compliance";
import { logEvent } from "@/lib/services/accounts/auditService";
import {
  buildPersonalDataWorkbook,
  getDataRequestSubject,
} from "@/lib/services/privacy/dataRequestService";
import { POST } from "@/app/api/admin/data-requests/[id]/export/route";

const admin = { id: "a-1", email: "admin@slu.edu.ph", role: "SUPER_ADMIN" };
const ID = "11111111-1111-4111-8111-111111111111";

const call = (body: unknown = { password: "pw" }) =>
  POST(
    new NextRequest(`http://localhost/api/admin/data-requests/${ID}/export`, {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) }
  );

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue(admin);
  (confirmPassword as jest.Mock).mockResolvedValue(null);
  (getDataRequestSubject as jest.Mock).mockResolvedValue({ userId: "u-1" });
  (buildPersonalDataWorkbook as jest.Mock).mockResolvedValue({
    email: "s@slu.edu.ph",
    sheets: [
      { name: "Account", rows: [["Email"], ["s@slu.edu.ph"]] },
      { name: "Activity", rows: [["Action"]] },
    ],
  });
});

it("refuses a coordinator with 401 before anything else", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ ...admin, role: "DEPARTMENT_COORDINATOR" });
  const res = await call();
  expect(res.status).toBe(401);
  expect(getDataRequestSubject).not.toHaveBeenCalled();
  expect(confirmPassword).not.toHaveBeenCalled();
});

it("returns 404 for an unknown request after the password check passes", async () => {
  (getDataRequestSubject as jest.Mock).mockRejectedValue(
    new ComplianceNotFoundError("Request not found")
  );
  const res = await call();
  expect(res.status).toBe(404);
  expect(confirmPassword).toHaveBeenCalledWith(admin, "pw", "10.0.0.1");
  expect(buildPersonalDataWorkbook).not.toHaveBeenCalled();
});

it("returns 401 for a wrong password, even for an unknown id, without a subject lookup", async () => {
  (confirmPassword as jest.Mock).mockResolvedValue(
    NextResponse.json({ error: "Password confirmation failed" }, { status: 401 })
  );
  (getDataRequestSubject as jest.Mock).mockRejectedValue(
    new ComplianceNotFoundError("Request not found")
  );
  const res = await call();
  expect(res.status).toBe(401);
  expect(getDataRequestSubject).not.toHaveBeenCalled();
  expect(buildPersonalDataWorkbook).not.toHaveBeenCalled();
  expect(logEvent).not.toHaveBeenCalled();
});

it("returns 423 for a locked account and builds and logs nothing", async () => {
  (confirmPassword as jest.Mock).mockResolvedValue(
    NextResponse.json(
      { error: "Too many failed attempts — try again after 3:05 PM" },
      { status: 423 }
    )
  );
  const res = await call();
  expect(res.status).toBe(423);
  expect(buildPersonalDataWorkbook).not.toHaveBeenCalled();
  expect(logEvent).not.toHaveBeenCalled();
});

it("exports an xlsx and logs DSAR_EXPORTED after the build", async () => {
  const res = await call();

  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toMatch(
    /idsms-dsar-11111111-\d{4}-\d{2}-\d{2}\.xlsx/
  );
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  expect(wb.SheetNames).toEqual(["Account", "Activity"]);
  expect(buildPersonalDataWorkbook).toHaveBeenCalledWith("u-1");
  expect(logEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: "a-1",
      action: "DSAR_EXPORTED",
      entityType: "DataRequest",
      entityId: ID,
      detail: { userId: "u-1", sheets: 2 },
    })
  );
});

it("does not log DSAR_EXPORTED when the build fails", async () => {
  (buildPersonalDataWorkbook as jest.Mock).mockRejectedValue(new Error("db down"));
  const res = await call();
  expect(res.status).toBe(500);
  expect(logEvent).not.toHaveBeenCalled();
});
