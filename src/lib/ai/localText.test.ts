import { extractiveSummary, sentences, toneWorthAsking } from "@/lib/ai/localText";

const days = [
  {
    id: "d1",
    accomplishments:
      "Attended the morning meeting. Designed the database schema for the inventory module.",
  },
  { id: "d2", accomplishments: "Attended the morning meeting. Fixed bugs." },
  {
    id: "d3",
    accomplishments:
      "Wrote unit tests for the inventory schema and reviewed a teammate's pull request.",
  },
];

it("picks the intern's own distinctive sentences, one per day, in day order", () => {
  const picked = extractiveSummary(days);
  expect(picked.length).toBeLessThanOrEqual(3);
  expect(picked.map((p) => p.entryId)).toEqual([...new Set(picked.map((p) => p.entryId))]);
  // Every quote is copied exactly from its day.
  for (const p of picked) {
    expect(days.find((d) => d.id === p.entryId)!.accomplishments).toContain(p.quote);
  }
  // The routine line repeated on two days loses to the distinctive work.
  expect(picked[0]).toEqual({
    entryId: "d1",
    quote: "Designed the database schema for the inventory module.",
  });
});

it("skips fragments too short to stand as a summary sentence", () => {
  expect(sentences("Fixed bugs. Wrote the API docs for the payroll service.")).toEqual([
    "Wrote the API docs for the payroll service.",
  ]);
  expect(extractiveSummary([{ id: "x", accomplishments: "ok" }])).toEqual([]);
});

it("asks the tone model only about weeks with a cue word, in English or Filipino", () => {
  expect(toneWorthAsking(["Built the login page."])).toBe(false);
  expect(toneWorthAsking(["I had nothing to do all afternoon."])).toBe(true);
  expect(toneWorthAsking(["Sobrang pagod ako ngayong linggo."])).toBe(true);
});
