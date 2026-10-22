import { buildInternshipTrack } from "@/lib/utils/internshipTrack";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("buildInternshipTrack", () => {
  // Thursday 22 Oct 2026, Manila. Current week starts Mon 19 Oct.
  const now = new Date("2026-10-22T04:00:00Z");

  it("runs from the first report to the projected finish, one cell per week", () => {
    const weeks = buildInternshipTrack({
      reports: [
        { weekStart: d("2026-09-28"), state: "APPROVED" },
        { weekStart: d("2026-10-05"), state: "SUBMITTED" },
      ],
      projectedFinish: d("2026-11-11"),
      now,
    });
    expect(weeks.map((w) => [w.weekStart.toISOString().slice(0, 10), w.kind])).toEqual([
      ["2026-09-28", "confirmed"],
      ["2026-10-05", "review"],
      ["2026-10-12", "missing"], // ended 18 Oct, due Tue 20 Oct, nothing filed
      ["2026-10-19", "open"], // this week
      ["2026-10-26", "ahead"],
      ["2026-11-02", "ahead"],
      ["2026-11-09", "ahead"],
    ]);
    expect(weeks.find((w) => w.isCurrent)?.weekStart).toEqual(d("2026-10-19"));
    expect(weeks.at(-1)?.isFinish).toBe(true);
  });

  it("marks returned weeks and still-open drafts", () => {
    const weeks = buildInternshipTrack({
      reports: [
        { weekStart: d("2026-10-12"), state: "RETURNED" },
        { weekStart: d("2026-10-19"), state: "DRAFT" },
      ],
      projectedFinish: null,
      now,
    });
    expect(weeks.map((w) => w.kind)).toEqual(["returned", "open"]);
  });

  it("starts at the current week when there are no reports yet", () => {
    const weeks = buildInternshipTrack({ reports: [], projectedFinish: null, now });
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ kind: "open", isCurrent: true });
  });

  it("caps a very long internship at 30 weeks", () => {
    const weeks = buildInternshipTrack({
      reports: [{ weekStart: d("2026-09-28"), state: "APPROVED" }],
      projectedFinish: d("2027-12-31"),
      now,
    });
    expect(weeks).toHaveLength(30);
  });
});
