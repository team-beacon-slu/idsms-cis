import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { getAttentionItems } from "@/lib/services/attentionService";

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
