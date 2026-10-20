/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/conductService", () => ({
  ...jest.requireActual("@/lib/services/conductService"),
  revokeConductRecord: jest.fn(),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { ConductStateError, revokeConductRecord } from "@/lib/services/conductService";
import { POST } from "@/app/api/conduct-records/[id]/revoke/route";

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/conduct-records/cr-1/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id: "cr-1" } }
  );

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "f-1", role: "FACULTY_ADVISER" });
});

it("rejects an intern with 401", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "s-1", role: "STUDENT_INTERN" });
  expect((await call({ reason: "Issued by mistake here" })).status).toBe(401);
  expect(revokeConductRecord).not.toHaveBeenCalled();
});

it("revokes for staff, and maps a double revoke to 409", async () => {
  expect((await call({ reason: "Issued by mistake here" })).status).toBe(200);
  (revokeConductRecord as jest.Mock).mockRejectedValueOnce(new ConductStateError("done"));
  expect((await call({ reason: "Issued by mistake here" })).status).toBe(409);
});
