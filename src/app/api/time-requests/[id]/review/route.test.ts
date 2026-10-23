/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/attendance/timeRequestService", () => ({
  ...jest.requireActual("@/lib/services/attendance/timeRequestService"),
  reviewTimeRequest: jest.fn(),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import {
  reviewTimeRequest,
  TimeRequestStateError,
} from "@/lib/services/attendance/timeRequestService";
import { POST } from "@/app/api/time-requests/[id]/review/route";

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/time-requests/tr-1/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "tr-1" }) }
  );

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "f-1", role: "FACULTY_ADVISER" });
  (reviewTimeRequest as jest.Mock).mockResolvedValue({
    studentProfileId: "p-1",
    status: "VALIDATED",
  });
});

it("rejects a student with 401", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "s-1", role: "STUDENT_INTERN" });
  expect((await call({ action: "APPROVE" })).status).toBe(401);
  expect(reviewTimeRequest).not.toHaveBeenCalled();
});

it("returns 400 for a Return without a note", async () => {
  expect((await call({ action: "RETURN" })).status).toBe(400);
  expect(reviewTimeRequest).not.toHaveBeenCalled();
});

it("approves for an assigned adviser", async () => {
  const res = await call({ action: "APPROVE" });
  expect(res.status).toBe(200);
  expect(reviewTimeRequest).toHaveBeenCalledWith(
    "tr-1",
    "APPROVE",
    undefined,
    expect.anything(),
    null
  );
});

it("maps an unassigned adviser to 403 and a state conflict to 409", async () => {
  (reviewTimeRequest as jest.Mock).mockRejectedValueOnce(new ForbiddenError());
  expect((await call({ action: "APPROVE" })).status).toBe(403);
  (reviewTimeRequest as jest.Mock).mockRejectedValueOnce(new TimeRequestStateError("done"));
  expect((await call({ action: "APPROVE" })).status).toBe(409);
});
