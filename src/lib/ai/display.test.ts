import { getAdvisoryView } from "@/lib/ai/display";
import type { JobId } from "@/lib/ai/jobs";

const entries = [
  { id: "e-1", reportDate: new Date("2026-10-12T00:00:00Z") },
  { id: "e-2", reportDate: new Date("2026-10-13T00:00:00Z") },
];
const hints = {
  similar: { entryId: "e-1", prevEntryId: "old", prevDate: "2026-10-05", score: 0.82 },
  tone: { entryId: "e-2", quote: "I was left alone all day" },
  summary: [{ entryId: "e-1", quote: "Built the login page." }],
  coverage: { missing: ["Testing"], weeks: 4 },
  addressedToAi: ["e-2"],
};
const report = { aiHints: hints, aiProcessedAt: new Date(), dailyEntries: entries };
const on = (...jobs: JobId[]) => ({ on: new Set(jobs), similarityThreshold: 0.7 });

it("shows each hint only while its job is on", () => {
  const all = getAdvisoryView(report, on("copy", "tone", "summary", "coverage"));
  expect(all.similar).toEqual(expect.objectContaining({ date: "2026-10-12", score: 0.82 }));
  expect(all.tone).toEqual(expect.objectContaining({ date: "2026-10-13" }));
  expect(all.summary).toHaveLength(1);
  expect(all.coverage).toEqual({ missing: ["Testing"], weeks: 4 });

  const some = getAdvisoryView(report, on("summary"));
  expect(some.similar).toBeNull();
  expect(some.tone).toBeNull();
  expect(some.coverage).toBeNull();
  expect(some.summary).toHaveLength(1);
});

it("hides everything when no report job is on (or the person's AI assist is off)", () => {
  expect(getAdvisoryView(report, on())).toEqual(
    expect.objectContaining({ pending: false, similar: null, summary: [] })
  );
});

it("compares similarity with today's threshold", () => {
  expect(getAdvisoryView(report, { ...on("copy"), similarityThreshold: 0.85 }).similar).toBeNull();
});

it("marks unprocessed reports as pending", () => {
  expect(getAdvisoryView({ ...report, aiProcessedAt: null }, on("copy")).pending).toBe(true);
});

it("always notes entries addressed to the AI, with their date", () => {
  expect(getAdvisoryView(report, on("copy")).addressedToAi).toEqual([
    { entryId: "e-2", date: "2026-10-13" },
  ]);
});
