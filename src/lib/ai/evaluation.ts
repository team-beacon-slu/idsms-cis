export type LabeledScore = { score: number; label: "DUPLICATE" | "BOILERPLATE" };

export interface EvalResult {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  passes: boolean;
  evaluatedAt: string;
  pairCount: number;
}

export const MIN_GOLDEN_PAIRS = 30; // NFR-AI-01
export const MIN_PRECISION = 0.8; // NFR-AI-02
export const MIN_RECALL = 0.7; // NFR-AI-02

// Pure: the confusion matrix for "flag when cosine similarity > threshold"
// over the faculty-labelled golden set.
export function evaluateThreshold(
  scores: LabeledScore[],
  threshold: number,
  now = new Date()
): EvalResult {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const { score, label } of scores) {
    const flagged = score > threshold;
    if (label === "DUPLICATE") {
      if (flagged) tp++;
      else fn++;
    } else if (flagged) fp++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return {
    threshold,
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    passes: scores.length >= MIN_GOLDEN_PAIRS && precision >= MIN_PRECISION && recall >= MIN_RECALL,
    evaluatedAt: now.toISOString(),
    pairCount: scores.length,
  };
}
