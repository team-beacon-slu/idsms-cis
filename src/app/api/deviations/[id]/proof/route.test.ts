/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/attendance/attendanceService", () => ({
  ...jest.requireActual("@/lib/services/attendance/attendanceService"),
  getDeviationReport: jest.fn(),
}));
jest.mock("@/lib/services/accounts/userService", () => ({
  ...jest.requireActual("@/lib/services/accounts/userService"),
  assertCanAccessStudent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { getDeviationReport } from "@/lib/services/attendance/attendanceService";
import { GET } from "@/app/api/deviations/[id]/proof/route";

const call = (proofUrl: string) => {
  (getDeviationReport as jest.Mock).mockResolvedValue({ studentProfileId: "p-1", proofUrl });
  return GET(new NextRequest("http://localhost/api/deviations/d-1/proof"), {
    params: Promise.resolve({ id: "d-1" }),
  });
};

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "f-1", role: "FACULTY_ADVISER" });
});

it("redirects to a Google Drive proof link", async () => {
  const res = await call("https://drive.google.com/file/d/abc/view");
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe("https://drive.google.com/file/d/abc/view");
});

it("refuses to redirect staff to any other site", async () => {
  const res = await call("https://evil.example/fake-login");
  expect(res.status).toBe(400);
  expect(res.headers.get("location")).toBeNull();
});
