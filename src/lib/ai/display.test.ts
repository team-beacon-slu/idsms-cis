import { getAdvisoryView } from "@/lib/ai/display";

const settings = {
  enabled: true,
  similarityThreshold: 0.7,
  minSentimentConfidence: 0.6,
  privacyApprovedBy: "x",
  lastEval: null,
};
const base = {
  similarityFlag: false,
  similarityScore: null,
  sentimentLabel: null,
  sentimentConfidence: null,
  sentimentReasoning: null,
  aiProcessedAt: new Date(),
};

it("suppresses low-confidence sentiment (NFR-AI-04)", () => {
  const view = getAdvisoryView(
    { ...base, sentimentLabel: "NEGATIVE", sentimentConfidence: 0.55 },
    settings
  );
  expect(view.sentiment).toBeNull();
});

it("shows confident sentiment with its reasoning", () => {
  const view = getAdvisoryView(
    {
      ...base,
      sentimentLabel: "NEGATIVE",
      sentimentConfidence: 0.8,
      sentimentReasoning: "Mentions frustration.",
    },
    settings
  );
  expect(view.sentiment).toEqual({
    label: "NEGATIVE",
    confidence: 0.8,
    reasoning: "Mentions frustration.",
  });
});

it("only shows similarity when flagged", () => {
  expect(getAdvisoryView({ ...base, similarityScore: 0.5 }, settings).similarity).toBeNull();
  expect(
    getAdvisoryView({ ...base, similarityFlag: true, similarityScore: 0.83 }, settings).similarity
  ).toEqual({
    score: 0.83,
  });
});

it("hides every advisory once AI is disabled", () => {
  const view = getAdvisoryView(
    {
      ...base,
      similarityFlag: true,
      similarityScore: 0.9,
      sentimentLabel: "NEGATIVE",
      sentimentConfidence: 0.9,
    },
    { ...settings, enabled: false }
  );
  expect(view).toEqual({ similarity: null, sentiment: null, pending: false });
});

it("flags against the current threshold, not the one stored at processing time", () => {
  const stored = { ...base, similarityFlag: true, similarityScore: 0.75 };
  expect(getAdvisoryView(stored, { ...settings, similarityThreshold: 0.8 }).similarity).toBeNull();
  expect(
    getAdvisoryView({ ...base, similarityFlag: false, similarityScore: 0.75 }, settings).similarity
  ).toEqual({ score: 0.75 });
});

it("marks unprocessed reports as pending only while AI is enabled", () => {
  expect(getAdvisoryView({ ...base, aiProcessedAt: null }, settings).pending).toBe(true);
  expect(
    getAdvisoryView({ ...base, aiProcessedAt: null }, { ...settings, enabled: false }).pending
  ).toBe(false);
});
