import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  getAttentionItems,
  requestsAwaitingReviewByStudent,
} from "@/lib/services/dashboards/attentionService";

describe("requestsAwaitingReviewByStudent", () => {
  it("counts pending requests per intern across the adviser's groups", async () => {
    (prismaMock.deviationReport.groupBy as unknown as jest.Mock).mockResolvedValue([
      { studentProfileId: "sp-1", _count: { _all: 2 } },
      { studentProfileId: "sp-2", _count: { _all: 1 } },
    ] as never);

    const byStudent = await requestsAwaitingReviewByStudent([
      { classGroupId: "cg-1", semesterId: "s-1" },
    ]);

    expect([...byStudent]).toEqual([
      ["sp-1", 2],
      ["sp-2", 1],
    ]);
    expect(prismaMock.deviationReport.groupBy).toHaveBeenCalledWith({
      by: ["studentProfileId"],
      where: {
        validationStatus: "PENDING",
        studentProfile: { OR: [{ classGroupId: "cg-1", semesterId: "s-1" }] },
      },
      _count: { _all: true },
    });
  });

  it("is empty without any assigned group", async () => {
    await expect(requestsAwaitingReviewByStudent([])).resolves.toEqual(new Map());
    expect(prismaMock.deviationReport.groupBy).not.toHaveBeenCalled();
  });
});

beforeEach(() => resetPrismaMock());

// Week of Oct 5–11, 2026 → due Tue Oct 13 (end of day, Manila).
const weekEnd = new Date("2026-10-11T00:00:00Z");

it("counts returned reports, drafts due within 48h, pending deviations, open checklist items", async () => {
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    { status: "RETURNED", weekEnd, revisionHistory: [{ type: "SUBMITTED" }, { type: "RETURNED" }] },
    { status: "PENDING", weekEnd, revisionHistory: [] }, // draft, due soon
    { status: "PENDING", weekEnd, revisionHistory: [{ type: "SUBMITTED" }] }, // already submitted
  ] as never);
  prismaMock.deviationReport.count.mockResolvedValue(2);
  prismaMock.preDeploymentChecklistItem.count.mockResolvedValue(6);

  const items = await getAttentionItems("p-1", new Date("2026-10-12T04:00:00Z"));

  expect(items).toEqual({
    returnedReports: 1,
    reportsDueSoon: 1,
    pendingDeviations: 2,
    incompleteChecklistItems: 3, // 9 required − 6 approved
  });
});

it("does not count a draft whose deadline is more than 48h away", async () => {
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    { status: "PENDING", weekEnd, revisionHistory: [] },
  ] as never);
  prismaMock.deviationReport.count.mockResolvedValue(0);
  prismaMock.preDeploymentChecklistItem.count.mockResolvedValue(9);

  const items = await getAttentionItems("p-1", new Date("2026-10-05T00:00:00Z"));
  expect(items.reportsDueSoon).toBe(0);
  expect(items.incompleteChecklistItems).toBe(0);
});
