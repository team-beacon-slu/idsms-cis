import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/services/predeployment/companyService", () => ({
  getExpiringMoaRecords: jest.fn().mockResolvedValue([]),
}));

import { getAdviserWaiting, getCoordinatorWaiting } from "./waitingService";

const ana = { id: "sp-1", fullName: "Ana Cruz", studentNumber: "2231" };
const ben = { id: "sp-2", fullName: null, studentNumber: "2232" };

beforeEach(() => resetPrismaMock());

describe("getCoordinatorWaiting", () => {
  it("lists one item per decision, using only each intern's latest work plan", async () => {
    prismaMock.workPlan.findMany
      // submitted work plans
      .mockResolvedValueOnce([
        { id: "wp-9", studentProfileId: "sp-2", studentProfile: ben },
      ] as never)
      // approved plans, newest first: Ana's latest change waits on the coordinator, an older one doesn't count
      .mockResolvedValueOnce([
        {
          studentProfileId: "sp-1",
          scheduleChangeHistory: [{ status: "PENDING_COORDINATOR" }],
          studentProfile: ana,
        },
        {
          studentProfileId: "sp-1",
          scheduleChangeHistory: [{ status: "PENDING_COORDINATOR" }],
          studentProfile: ana,
        },
        {
          studentProfileId: "sp-2",
          scheduleChangeHistory: [{ status: "APPROVED" }],
          studentProfile: ben,
        },
      ] as never);
    prismaMock.finalTechnicalReport.findMany.mockResolvedValue([] as never);
    prismaMock.deductionDispute.findMany.mockResolvedValue([
      { id: "dd-1", studentProfileId: "sp-1", studentProfile: ana },
    ] as never);
    prismaMock.company.count.mockResolvedValue(2);

    const items = await getCoordinatorWaiting();

    expect(items.map((i) => [i.intern, i.what, i.href])).toEqual([
      ["2232", "Work plan to review", "/students/sp-2/work-plan"],
      ["Ana Cruz", "Schedule change for final approval", "/students/sp-1/attendance"],
      ["Ana Cruz", "Deduction dispute to resolve", "/students/sp-1/attendance"],
      ["2 companies", "Not verified yet", "/companies"],
    ]);
  });
});

describe("getAdviserWaiting", () => {
  it("returns nothing without a class group, without querying further", async () => {
    prismaMock.facultyClassGroup.findMany.mockResolvedValue([] as never);
    expect(await getAdviserWaiting("f-1")).toEqual({
      timeRequests: [],
      scheduleChanges: [],
      uploadedChecklist: 0,
    });
    expect(prismaMock.deviationReport.findMany).not.toHaveBeenCalled();
  });
});
