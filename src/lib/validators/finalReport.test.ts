import {
  ATTACHMENT_KEYS,
  emptyAssessment,
  finalReportDraftSchema,
  rows,
  SECTION_KEYS,
  submitProblems,
} from "./finalReport";

const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, `Text for ${k}`]));
const attachments = Object.fromEntries(ATTACHMENT_KEYS.map((k) => [k, true]));
const rated = {
  work: Array(10).fill(3),
  others: [],
  supervisorGuidance: 4,
  coworkers: 4,
  self: Array(10).fill(3),
};
const complete = {
  sections,
  assessment: rated,
  supervisorScore: 4.5,
  supervisorScale: 5,
  peerScore: 90,
  peerScale: 100,
  attachments,
};

describe("finalReportDraftSchema", () => {
  it("accepts a partial draft", () => {
    expect(
      finalReportDraftSchema.safeParse({ sections: { companyDescription: "Hi" } }).success
    ).toBe(true);
  });

  it("rejects an unknown part, an oversized one, bad ratings and out-of-range scores", () => {
    const ok = (v: unknown) => finalReportDraftSchema.safeParse(v).success;
    expect(ok({ sections: { introduction: "x" } })).toBe(false); // the old outline's key
    expect(ok({ sections: { tasks: "x".repeat(10001) } })).toBe(false);
    expect(ok({ assessment: { ...rated, work: Array(10).fill(5) } })).toBe(false);
    expect(ok({ assessment: { ...rated, self: [4] } })).toBe(false);
    expect(ok({ supervisorScore: 6, supervisorScale: 5 })).toBe(false);
    expect(ok({ peerScore: 1, peerScale: 0 })).toBe(false);
  });
});

describe("submitProblems", () => {
  it("is empty for a complete report, even without the optional remarks", () => {
    const required = { ...sections, workRemarks: "", selfRemarks: "" };
    expect(submitProblems({ ...complete, sections: required })).toEqual([]);
  });

  it("lists every missing piece in SLU's order", () => {
    expect(
      submitProblems({
        ...complete,
        sections: { ...sections, officeCulture: "  " },
        assessment: { ...emptyAssessment(), self: rated.self },
        supervisorScore: null,
        attachments: { ...attachments, hteEvaluation: false },
      })
    ).toEqual([
      "Write the office environment/culture part",
      "Rate every item of the work assessment",
      "Enter the supervisor evaluation score",
      "Mark the FM-VAA-052 Host Training Establishment (HTE) Evaluation Form as attached in Google Classroom",
    ]);
  });
});

it("splits a list part into rows at blank lines", () => {
  expect(rows("Built the API.\nIn Node.\n\n  \n\nWrote tests.")).toEqual([
    "Built the API.\nIn Node.",
    "Wrote tests.",
  ]);
});
