/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/reports/finalReportService", () => ({
  ...jest.requireActual("@/lib/services/reports/finalReportService"),
  reviewFinalReport: jest.fn(),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { FinalReportStateError } from "@/lib/documents/errors";
import { reviewFinalReport } from "@/lib/services/reports/finalReportService";
import { POST } from "@/app/api/final-reports/[id]/review/route";

const call = () =>
  POST(
    new NextRequest("http://localhost/api/final-reports/fr-1/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "APPROVE", confirmed: [] }),
    }),
    { params: Promise.resolve({ id: "fr-1" }) }
  );

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });
});

it("rejects a faculty adviser with 401", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "f-1", role: "FACULTY_ADVISER" });
  expect((await call()).status).toBe(401);
  expect(reviewFinalReport).not.toHaveBeenCalled();
});

it("reviews for a coordinator, and maps an already-reviewed report to 409", async () => {
  expect((await call()).status).toBe(200);
  (reviewFinalReport as jest.Mock).mockRejectedValueOnce(new FinalReportStateError("done"));
  expect((await call()).status).toBe(409);
});
