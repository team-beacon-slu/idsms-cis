jest.mock("@/lib/services/accounts/auditService", () => ({ logEvent: jest.fn() }));

import { Role } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { logEvent } from "@/lib/services/accounts/auditService";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import { recordVisit } from "@/lib/services/predeployment/visitService";

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(logEvent).mockClear();
  prismaMock.companyVisit.create.mockResolvedValue({ id: "v-1" } as never);
});

const adviser = { id: "fac-1", role: Role.FACULTY_ADVISER };

it("records a visit, on site by default, and logs it against the company", async () => {
  await recordVisit("co-1", { visitedOn: "2026-11-05" }, adviser, "203.0.113.5");

  expect(prismaMock.companyVisit.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        companyId: "co-1",
        visitedOn: new Date("2026-11-05T00:00:00.000Z"),
        mode: "ON_SITE",
        notes: null,
        visitedBy: "fac-1",
      },
    })
  );
  expect(jest.mocked(logEvent).mock.calls[0][0]).toEqual(
    expect.objectContaining({
      action: "COMPANY_VISITED",
      entityId: "co-1",
      ipAddress: "203.0.113.5",
    })
  );
});

it("keeps a supervisor check-in's mode and trimmed notes", async () => {
  await recordVisit(
    "co-1",
    { visitedOn: "2026-11-05", mode: "CALL", notes: "  Spoke with the supervisor  " },
    { id: "coord-1", role: Role.DEPARTMENT_COORDINATOR }
  );

  expect(prismaMock.companyVisit.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ mode: "CALL", notes: "Spoke with the supervisor" }),
    })
  );
});

it("refuses an intern, before anything is saved", async () => {
  await expect(
    recordVisit("co-1", { visitedOn: "2026-11-05" }, { id: "si-1", role: Role.STUDENT_INTERN })
  ).rejects.toBeInstanceOf(ForbiddenError);
  expect(prismaMock.companyVisit.create).not.toHaveBeenCalled();
});

it("rejects an unknown mode", async () => {
  await expect(
    recordVisit("co-1", { visitedOn: "2026-11-05", mode: "EMAIL" }, adviser)
  ).rejects.toThrow();
  expect(prismaMock.companyVisit.create).not.toHaveBeenCalled();
});
