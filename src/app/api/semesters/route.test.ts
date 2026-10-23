/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({
  ...jest.requireActual("@/lib/auth/session"),
  requireUserApi: jest.fn(),
}));
jest.mock("@/lib/services/academic/semesterService", () => ({
  ...jest.requireActual("@/lib/services/academic/semesterService"),
  listSemesters: jest.fn(),
  createSemester: jest.fn(),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { createSemester, listSemesters } from "@/lib/services/academic/semesterService";
import { GET, POST } from "@/app/api/semesters/route";

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/semesters", {
    method: "POST",
    body: JSON.stringify(body),
  });
const valid = {
  name: "1st Semester",
  academicYear: "2026-2027",
  startDate: "2026-08-01",
  endDate: "2026-12-15",
};

beforeEach(() => jest.resetAllMocks());

describe("GET", () => {
  it("lets a coordinator list", async () => {
    (requireUserApi as jest.Mock).mockResolvedValue({ id: "c", role: "DEPARTMENT_COORDINATOR" });
    (listSemesters as jest.Mock).mockResolvedValue([{ id: "s1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ semesters: [{ id: "s1" }] });
  });

  it("refuses a faculty adviser with 401", async () => {
    (requireUserApi as jest.Mock).mockResolvedValue({ id: "f", role: "FACULTY_ADVISER" });
    expect((await GET()).status).toBe(401);
    expect(listSemesters).not.toHaveBeenCalled();
  });
});

describe("POST", () => {
  it("refuses a coordinator with 401", async () => {
    (requireUserApi as jest.Mock).mockResolvedValue({ id: "c", role: "DEPARTMENT_COORDINATOR" });
    expect((await POST(post(valid))).status).toBe(401);
    expect(createSemester).not.toHaveBeenCalled();
  });

  it("creates for a Super Admin with 201", async () => {
    (requireUserApi as jest.Mock).mockResolvedValue({ id: "a", role: "SUPER_ADMIN" });
    (createSemester as jest.Mock).mockResolvedValue({ id: "new" });
    const res = await POST(post(valid));
    expect(res.status).toBe(201);
    expect(createSemester).toHaveBeenCalledWith(valid, "a");
    await expect(res.json()).resolves.toEqual({ id: "new" });
  });

  it("answers 400 for invalid input", async () => {
    (requireUserApi as jest.Mock).mockResolvedValue({ id: "a", role: "SUPER_ADMIN" });
    const { ZodError } = jest.requireActual("zod");
    (createSemester as jest.Mock).mockRejectedValue(new ZodError([]));
    expect((await POST(post({ ...valid, academicYear: "bad" }))).status).toBe(400);
  });
});
