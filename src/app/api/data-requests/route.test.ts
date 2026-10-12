/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/dataRequestService", () => ({ createDataRequest: jest.fn() }));
jest.mock("@/lib/services/notificationRecipients", () => ({ getSuperAdminIds: jest.fn() }));
jest.mock("@/lib/services/notify", () => ({ notify: jest.fn() }));

import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/lib/auth/errors";
import { requireUserApi } from "@/lib/auth/session";
import { DataRequestStateError } from "@/lib/errors/compliance";
import { createDataRequest } from "@/lib/services/dataRequestService";
import { getSuperAdminIds } from "@/lib/services/notificationRecipients";
import { notify } from "@/lib/services/notify";
import { POST } from "@/app/api/data-requests/route";

const student = { id: "u-1", email: "s@slu.edu.ph", role: "STUDENT_INTERN" };
const call = () =>
  POST(
    new NextRequest("http://localhost/api/data-requests", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1" },
    })
  );

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue(student);
  (createDataRequest as jest.Mock).mockResolvedValue({
    id: "r-1",
    dueAt: new Date("2026-10-27T00:00:00Z"),
  });
  (getSuperAdminIds as jest.Mock).mockResolvedValue(["a-1"]);
});

it("rejects an anonymous caller with 401", async () => {
  (requireUserApi as jest.Mock).mockRejectedValue(new UnauthorizedError("Not signed in"));
  const res = await call();
  expect(res.status).toBe(401);
  expect(createDataRequest).not.toHaveBeenCalled();
});

it("creates the request for the signed-in user and notifies super admins", async () => {
  const res = await call();

  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ id: "r-1", dueAt: "2026-10-27T00:00:00.000Z" });
  expect(createDataRequest).toHaveBeenCalledWith("u-1", "10.0.0.1");
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      userIds: ["a-1"],
      trigger: "DSAR_REQUESTED",
      title: "New data request",
      body: "s@slu.edu.ph asked for a copy of their personal data. Due 2026-10-27.",
      link: "/admin/export-center#data-requests",
      email: true,
    })
  );
});

it("returns 409 for a duplicate open request and notifies nobody", async () => {
  (createDataRequest as jest.Mock).mockRejectedValue(
    new DataRequestStateError("You already have an open request (due 2026-10-27)")
  );
  const res = await call();
  expect(res.status).toBe(409);
  expect(notify).not.toHaveBeenCalled();
});
