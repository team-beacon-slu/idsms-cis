import { evaluateThreshold, type LabeledScore } from "@/lib/ai/evaluation";

const dup = (score: number): LabeledScore => ({ score, label: "DUPLICATE" });
const boiler = (score: number): LabeledScore => ({ score, label: "BOILERPLATE" });

it("builds the confusion matrix at the threshold (score > threshold flags)", () => {
  const scores = [dup(0.95), dup(0.9), dup(0.65), boiler(0.8), boiler(0.4), boiler(0.3)];
  const r = evaluateThreshold(scores, 0.7, new Date("2026-10-11T00:00:00Z"));
  expect(r).toEqual(
    expect.objectContaining({ tp: 2, fn: 1, fp: 1, tn: 2, pairCount: 6, threshold: 0.7 })
  );
  expect(r.precision).toBeCloseTo(2 / 3);
  expect(r.recall).toBeCloseTo(2 / 3);
  expect(r.passes).toBe(false);
});

it("passes only with ≥80% precision, ≥70% recall, and ≥30 labeled pairs (NFR-AI-01/02)", () => {
  const good = [...Array(15)].map(() => dup(0.9)).concat([...Array(15)].map(() => boiler(0.2)));
  expect(evaluateThreshold(good, 0.7).passes).toBe(true);
  expect(evaluateThreshold(good.slice(0, 20), 0.7).passes).toBe(false); // too few pairs
});

it("reports zero precision (not NaN) when nothing is flagged", () => {
  const r = evaluateThreshold([dup(0.1), boiler(0.1)], 0.7);
  expect(r.precision).toBe(0);
  expect(r.recall).toBe(0);
});
