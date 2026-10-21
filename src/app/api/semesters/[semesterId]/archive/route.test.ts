/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/semesterService", () => ({
  ...jest.requireActual("@/lib/services/semesterService"),
  archiveSemester: jest.fn(),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { SemesterStateError, archiveSemester } from "@/lib/services/semesterService";
import { POST } from "@/app/api/semesters/[semesterId]/archive/route";

const req = () => new NextRequest("http://localhost/x", { method: "POST" });
const ctx = { params: Promise.resolve({ semesterId: "sem-1" }) };

beforeEach(() => jest.resetAllMocks());

it("refuses a coordinator with 401 and does nothing", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "c-1", role: "DEPARTMENT_COORDINATOR" });
  const res = await POST(req(), ctx);
  expect(res.status).toBe(401);
  expect(archiveSemester).not.toHaveBeenCalled();
});

it("lets a Super Admin archive", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "a-1", role: "SUPER_ADMIN" });
  const res = await POST(req(), ctx);
  expect(res.status).toBe(200);
  expect(archiveSemester).toHaveBeenCalledWith("sem-1", "a-1");
});

it("maps SemesterStateError to 409 with its message", async () => {
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "a-1", role: "SUPER_ADMIN" });
  (archiveSemester as jest.Mock).mockRejectedValue(
    new SemesterStateError("This semester is already archived")
  );
  const res = await POST(req(), ctx);
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({ error: "This semester is already archived" });
});
