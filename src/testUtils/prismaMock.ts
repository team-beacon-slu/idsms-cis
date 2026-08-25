import { PrismaClient } from "@prisma/client";
import { DeepMockProxy, mockDeep, mockReset } from "jest-mock-extended";

// Prisma's own recommended unit-testing pattern: replace the app's singleton
// with a deep mock so service functions never touch a real database. The
// jest.mock call must live in this file (not the consuming test) — Jest only
// hoists jest.mock() calls written in the same file above its imports, and
// mockDeep/PrismaClient are imports (not local out-of-scope variables), which
// is what the hoisting-safety check requires.
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "@/lib/prisma";

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

// userService's transaction calls are all the interactive-callback form
// (`prisma.$transaction(async (tx) => ...)`) — never the sequential-array
// form — so the mock only needs to support that, by handing the callback
// the same mock instance as its `tx` client.
export function resetPrismaMock() {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation(((callback: unknown) => {
    if (typeof callback === "function") {
      return (callback as (tx: typeof prismaMock) => unknown)(prismaMock);
    }
    return Promise.all(callback as Promise<unknown>[]);
  }) as typeof prismaMock.$transaction);
}
