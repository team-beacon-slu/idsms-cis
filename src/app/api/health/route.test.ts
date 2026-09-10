/**
 * @jest-environment node
 */
import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: jest.fn() },
}));
import { prisma } from "@/lib/prisma";
const mockQuery = prisma.$queryRaw as jest.Mock;

beforeEach(() => mockQuery.mockReset());

it("returns 200 ok when the database responds", async () => {
  mockQuery.mockResolvedValue([{ "?column?": 1 }]);
  const res = await GET();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ status: "ok" });
});

it("returns 503 error when the database query throws", async () => {
  mockQuery.mockRejectedValue(new Error("connection refused"));
  const res = await GET();
  expect(res.status).toBe(503);
  await expect(res.json()).resolves.toEqual({ status: "error" });
});
