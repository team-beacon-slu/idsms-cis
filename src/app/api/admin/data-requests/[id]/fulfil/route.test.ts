/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/privacy/dataRequestService", () => ({
  markDataRequestFulfilled: jest.fn(),
}));
jest.mock("@/lib/services/notifications/notify", () => ({ notify: jest.fn() }));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { DataRequestStateError } from "@/lib/errors/compliance";
import { markDataRequestFulfilled } from "@/lib/services/privacy/dataRequestService";
import { notify } from "@/lib/services/notifications/notify";
import { POST } from "@/app/api/admin/data-requests/[id]/fulfil/route";

const admin = { id: "a-1", email: "admin@slu.edu.ph", role: "SUPER_ADMIN" };
const ID = "11111111-1111-4111-8111-111111111111";
const call = () =>
  POST(
    new NextRequest(`http://localhost/api/admin/data-requests/${ID}/fulfil`, { method: "POST" }),
    {
      params: Promise.resolve({ id: ID }),
    }
  );

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue(admin);
  (markDataRequestFulfilled as jest.Mock).mockResolvedValue({ userId: "u-1" });
});

it("refuses a non-admin with 401", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ ...admin, role: "FACULTY_ADVISER" });
  const res = await call();
  expect(res.status).toBe(401);
  expect(markDataRequestFulfilled).not.toHaveBeenCalled();
});

it("fulfils and notifies the requester after commit", async () => {
  const res = await call();

  expect(res.status).toBe(200);
  expect(markDataRequestFulfilled).toHaveBeenCalledWith(ID, "a-1");
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      userIds: ["u-1"],
      trigger: "DSAR_FULFILLED",
      title: "Your data request is complete",
      body: "The Super Admin has prepared your data. They will send you the file.",
      link: "/profile",
    })
  );
});

it("returns 409 when fulfilled twice and sends no notification", async () => {
  (markDataRequestFulfilled as jest.Mock).mockRejectedValue(
    new DataRequestStateError("This request is already fulfilled")
  );
  const res = await call();
  expect(res.status).toBe(409);
  expect(notify).not.toHaveBeenCalled();
});
