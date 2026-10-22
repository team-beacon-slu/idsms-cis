import { hoursBuckets, statusCounts, weeklyColumns } from "./internCharts";

const row = (over: Partial<Parameters<typeof statusCounts>[0][number]>) => ({
  status: "ON_TRACK" as const,
  hoursPercent: 0,
  recentWeeks: [],
  ...over,
});

describe("internCharts", () => {
  it("counts statuses", () => {
    const c = statusCounts([row({}), row({ status: "COMPLETED" }), row({})]);
    expect(c).toEqual({ COMPLETED: 1, ON_TRACK: 2, NEEDS_ATTENTION: 0, NOT_DEPLOYED: 0 });
  });

  it("aligns shorter tracks to the current week and skips 'ahead'", () => {
    const cols = weeklyColumns(
      [
        row({ recentWeeks: ["confirmed", "missing", "open"] }),
        row({ recentWeeks: ["review", "ahead"] }),
      ],
      3
    );
    expect(cols.map((c) => c.weeksAgo)).toEqual([2, 1, 0]);
    expect(cols[0].counts.confirmed).toBe(1);
    expect(cols[1]).toMatchObject({ total: 2, counts: { missing: 1, review: 1 } });
    expect(cols[2]).toMatchObject({ total: 1, counts: { open: 1 } });
  });

  it("buckets hours, with 100% on its own", () => {
    const b = hoursBuckets([0, 24, 25, 74, 99, 100, 130].map((h) => row({ hoursPercent: h })));
    expect(b).toEqual([2, 1, 1, 1, 2]);
  });
});
