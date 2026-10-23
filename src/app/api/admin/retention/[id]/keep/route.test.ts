/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/privacy/retentionService", () => ({ keepRetentionFlag: jest.fn() }));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { ComplianceNotFoundError, RetentionStateError } from "@/lib/errors/compliance";
import { keepRetentionFlag } from "@/lib/services/privacy/retentionService";
import { POST } from "@/app/api/admin/retention/[id]/keep/route";

const ID = "11111111-1111-4111-8111-111111111111";
const call = () =>
  POST(new NextRequest(`http://localhost/api/admin/retention/${ID}/keep`, { method: "POST" }), {
    params: Promise.resolve({ id: ID }),
  });

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "a-1", role: "SUPER_ADMIN" });
});

it("rejects a coordinator with 401", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "COORDINATOR" });
  expect((await call()).status).toBe(401);
  expect(keepRetentionFlag).not.toHaveBeenCalled();
});

it("keeps the file for a Super Admin", async () => {
  const res = await call();
  expect(res.status).toBe(200);
  expect(keepRetentionFlag).toHaveBeenCalledWith(ID, "a-1");
});

it("maps unknown id to 404 and reviewed flag to 409", async () => {
  (keepRetentionFlag as jest.Mock).mockRejectedValueOnce(new ComplianceNotFoundError("nope"));
  expect((await call()).status).toBe(404);
  (keepRetentionFlag as jest.Mock).mockRejectedValueOnce(new RetentionStateError("done"));
  expect((await call()).status).toBe(409);
});
