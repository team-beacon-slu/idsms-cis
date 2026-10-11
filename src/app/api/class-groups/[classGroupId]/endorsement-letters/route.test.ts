/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({ requireUserApi: jest.fn(), requireRole: jest.fn() }));
jest.mock("@/lib/services/userService", () => ({ verifyCredentials: jest.fn() }));
jest.mock("@/lib/services/notificationEvents", () => ({ notifyEndorsementReady: jest.fn() }));
jest.mock("@/lib/services/documentService", () => ({ generateBulkEndorsementLetters: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { facultyClassGroup: { findMany: jest.fn() }, studentProfile: { count: jest.fn() } },
}));
jest.mock("@/lib/utils/apiError", () => ({
  handleApiError: (e: Error) => Response.json({ error: e.message }, { status: 500 }),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/services/userService";
import { generateBulkEndorsementLetters } from "@/lib/services/documentService";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/class-groups/[classGroupId]/endorsement-letters/route";

const params = { params: { classGroupId: "cg-1" } };
const req = (body: unknown) =>
  new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({
    id: "fac-1",
    email: "f@x",
    role: "FACULTY_ADVISER",
  });
  (prisma.facultyClassGroup.findMany as jest.Mock).mockResolvedValue([{ semesterId: "sem-1" }]);
  (prisma.studentProfile.count as jest.Mock).mockResolvedValue(10);
});

it("bulk refuses a wrong password", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: false, reason: "INVALID_CREDENTIALS" });
  const res = await POST(req({ password: "nope" }), params);
  expect(res.status).toBe(401);
  expect(generateBulkEndorsementLetters).not.toHaveBeenCalled();
});

it("tells a locked-out user they are locked, not that the password was wrong", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({
    ok: false,
    reason: "ACCOUNT_LOCKED",
    lockedUntil: new Date("2026-10-11T06:30:00Z"),
  });
  const res = await POST(req({ password: "right" }), params);
  expect(res.status).toBe(423);
  await expect(res.json()).resolves.toEqual(
    expect.objectContaining({ error: expect.stringMatching(/too many failed attempts/i) })
  );
  expect(generateBulkEndorsementLetters).not.toHaveBeenCalled();
});

it("bulk refuses a class group the faculty member doesn't advise", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: true });
  (prisma.facultyClassGroup.findMany as jest.Mock).mockResolvedValue([]);
  const res = await POST(req({ password: "right" }), params);
  expect(res.status).toBe(403);
  expect(generateBulkEndorsementLetters).not.toHaveBeenCalled();
});

it("refuses more than 40 students in one request", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: true });
  (prisma.studentProfile.count as jest.Mock).mockResolvedValue(41);
  const res = await POST(req({ password: "right" }), params);
  expect(res.status).toBe(400);
  expect(generateBulkEndorsementLetters).not.toHaveBeenCalled();
});

it("scopes a faculty member's bulk run to the semesters they advise this group for", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: true });
  (generateBulkEndorsementLetters as jest.Mock).mockResolvedValue({
    generated: [],
    skipped: [],
    failed: [],
  });
  await POST(req({ password: "right" }), params);
  expect(prisma.studentProfile.count).toHaveBeenCalledWith({
    where: { classGroupId: "cg-1", deletedAt: null, semesterId: { in: ["sem-1"] } },
  });
  expect(generateBulkEndorsementLetters).toHaveBeenCalledWith("cg-1", "fac-1", ["sem-1"]);
});

it("returns the generated/skipped/failed breakdown", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: true });
  (generateBulkEndorsementLetters as jest.Mock).mockResolvedValue({
    generated: ["p-1"],
    skipped: [],
    failed: [],
  });
  const res = await POST(req({ password: "right" }), params);
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ generated: ["p-1"], skipped: [], failed: [] });
});
