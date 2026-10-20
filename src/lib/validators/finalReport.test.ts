import {
  ATTACHMENT_KEYS,
  finalReportDraftSchema,
  SECTION_KEYS,
  submitProblems,
} from "./finalReport";

const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, `Text for ${k}`]));
const attachments = Object.fromEntries(ATTACHMENT_KEYS.map((k) => [k, true]));
const complete = {
  sections,
  supervisorScore: 4.5,
  supervisorScale: 5,
  peerScore: 90,
  peerScale: 100,
  attachments,
};

describe("finalReportDraftSchema", () => {
  it("accepts a partial draft", () => {
    expect(finalReportDraftSchema.safeParse({ sections: { introduction: "Hi" } }).success).toBe(
      true
    );
  });

  it("rejects an unknown section, an oversized one and out-of-range scores", () => {
    const bad = (v: unknown) => finalReportDraftSchema.safeParse(v).success;
    expect(bad({ sections: { other: "x" } })).toBe(false);
    expect(bad({ sections: { introduction: "x".repeat(10001) } })).toBe(false);
    expect(bad({ supervisorScore: 6, supervisorScale: 5 })).toBe(false);
    expect(bad({ peerScore: -1, peerScale: 100 })).toBe(false);
    expect(bad({ peerScore: 1, peerScale: 0 })).toBe(false);
  });
});

describe("submitProblems", () => {
  it("is empty for a complete report", () => {
    expect(submitProblems(complete)).toEqual([]);
  });

  it("lists every missing piece", () => {
    expect(
      submitProblems({
        sections: { ...sections, learnings: "  " },
        supervisorScore: null,
        supervisorScale: 5,
        peerScore: 80,
        peerScale: 100,
        attachments: { ...attachments, certificateOfCompletion: false },
      })
    ).toEqual([
      "Write the learnings section",
      "Enter the supervisor evaluation score",
      "Mark the certificate of completion as attached in Google Classroom",
    ]);
  });
});
