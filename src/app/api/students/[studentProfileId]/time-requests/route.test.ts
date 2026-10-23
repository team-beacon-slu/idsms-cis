/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/attendance/timeRequestService", () => ({
  ...jest.requireActual("@/lib/services/attendance/timeRequestService"),
  createTimeRequest: jest.fn(),
  listTimeRequests: jest.fn(),
}));
jest.mock("@/lib/services/accounts/userService", () => ({
  ...jest.requireActual("@/lib/services/accounts/userService"),
  assertCanAccessStudent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import { createTimeRequest, listTimeRequests } from "@/lib/services/attendance/timeRequestService";
import { GET, POST } from "@/app/api/students/[studentProfileId]/time-requests/route";

const params = { params: Promise.resolve({ studentProfileId: "p-1" }) };
const post = (body: BodyInit, contentType = "application/json") =>
  POST(
    new NextRequest("http://localhost/api/students/p-1/time-requests", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }),
    params
  );

beforeEach(() => {
  jest.resetAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "s-1", role: "STUDENT_INTERN" });
  (createTimeRequest as jest.Mock).mockResolvedValue({ id: "tr-1" });
  (listTimeRequests as jest.Mock).mockResolvedValue([]);
});

it("creates a request for the intern with 201", async () => {
  const res = await post(JSON.stringify({ deviationType: "OVERTIME" }));
  expect(res.status).toBe(201);
  expect(createTimeRequest).toHaveBeenCalledWith(
    "p-1",
    { deviationType: "OVERTIME" },
    expect.anything(),
    null
  );
});

it("rejects staff filing with 401", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "f-1", role: "FACULTY_ADVISER" });
  expect((await post("{}")).status).toBe(401);
  expect(createTimeRequest).not.toHaveBeenCalled();
});

it("refuses another student's profile with 403", async () => {
  (createTimeRequest as jest.Mock).mockRejectedValue(new ForbiddenError());
  expect((await post("{}")).status).toBe(403);
});

it("accepts no multipart upload", async () => {
  const form = new FormData();
  form.set("file", new Blob(["x"]), "proof.pdf");
  const res = await POST(
    new NextRequest("http://localhost/api/students/p-1/time-requests", {
      method: "POST",
      body: form,
    }),
    params
  );
  expect(res.status).toBe(415);
  expect(createTimeRequest).not.toHaveBeenCalled();
});

it("lists requests for whoever can access the student", async () => {
  const res = await GET(new NextRequest("http://localhost/api/students/p-1/time-requests"), params);
  expect(res.status).toBe(200);
  expect(assertCanAccessStudent).toHaveBeenCalledWith(expect.anything(), "p-1");
});
