/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/auth/confirmPassword", () => ({ confirmPassword: jest.fn() }));
jest.mock("@/lib/services/privacy/retentionService", () => ({
  deleteRetentionFlaggedFile: jest.fn(),
}));
jest.mock("@/lib/storage", () => ({
  ...jest.requireActual("@/lib/storage"),
  deleteObject: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { confirmPassword } from "@/lib/auth/confirmPassword";
import { ComplianceNotFoundError } from "@/lib/errors/compliance";
import { deleteRetentionFlaggedFile } from "@/lib/services/privacy/retentionService";
import { StorageDeleteError } from "@/lib/storage";
import { POST } from "@/app/api/admin/retention/[id]/delete/route";

const ID = "11111111-1111-4111-8111-111111111111";
const call = (body: unknown = { password: "pw" }) =>
  POST(
    new NextRequest(`http://localhost/api/admin/retention/${ID}/delete`, {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) }
  );

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "a-1", role: "SUPER_ADMIN" });
  (confirmPassword as jest.Mock).mockResolvedValue(null);
});

it("rejects a non-admin with 401 before anything else", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "COORDINATOR" });
  expect((await call()).status).toBe(401);
  expect(confirmPassword).not.toHaveBeenCalled();
  expect(deleteRetentionFlaggedFile).not.toHaveBeenCalled();
});

it("returns 401 on a wrong password and never touches storage", async () => {
  (confirmPassword as jest.Mock).mockResolvedValue(
    NextResponse.json({ error: "Password confirmation failed" }, { status: 401 })
  );
  expect((await call({ password: "bad" })).status).toBe(401);
  expect(deleteRetentionFlaggedFile).not.toHaveBeenCalled();
});

it("deletes after the password passes", async () => {
  const res = await call();
  expect(res.status).toBe(200);
  expect(deleteRetentionFlaggedFile).toHaveBeenCalledWith(ID, "a-1", "10.0.0.1");
});

it("maps StorageDeleteError to 502 with its message", async () => {
  (deleteRetentionFlaggedFile as jest.Mock).mockRejectedValue(
    new StorageDeleteError("storage down")
  );
  const res = await call();
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: "storage down" });
});

it("returns 404 for an unknown id", async () => {
  (deleteRetentionFlaggedFile as jest.Mock).mockRejectedValue(new ComplianceNotFoundError("nope"));
  expect((await call()).status).toBe(404);
});
