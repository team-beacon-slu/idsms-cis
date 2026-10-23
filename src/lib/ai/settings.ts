import { prisma } from "@/lib/prisma";
import type { EvalResult } from "@/lib/ai/evaluation";

export const AI_KEYS = {
  enabled: "ai:enabled",
  threshold: "ai:similarity_threshold",
  minConfidence: "ai:min_sentiment_confidence",
  privacyApprovedBy: "ai:privacy_approved_by",
  lastEval: "ai:last_eval",
  goldenScores: "ai:golden_scores",
} as const;

export const THRESHOLD_MIN = 0.6; // FR-AI-02
export const THRESHOLD_MAX = 0.85;

export interface AiSettings {
  enabled: boolean;
  similarityThreshold: number;
  minSentimentConfidence: number;
  privacyApprovedBy: string | null;
  lastEval: EvalResult | null;
}

export async function getAiSettings(): Promise<AiSettings> {
  const rows = await prisma.systemConfig.findMany({
    where: { configKey: { in: Object.values(AI_KEYS) } },
    select: { configKey: true, configValue: true },
  });
  const value = (key: string) => rows.find((r) => r.configKey === key)?.configValue;

  const threshold = value(AI_KEYS.threshold);
  const confidence = value(AI_KEYS.minConfidence);
  const approvedBy = value(AI_KEYS.privacyApprovedBy);
  const lastEval = value(AI_KEYS.lastEval);

  return {
    enabled: value(AI_KEYS.enabled) === true,
    similarityThreshold:
      typeof threshold === "number" && threshold >= THRESHOLD_MIN && threshold <= THRESHOLD_MAX
        ? threshold
        : 0.7,
    minSentimentConfidence:
      typeof confidence === "number" && confidence > 0 && confidence < 1 ? confidence : 0.6,
    privacyApprovedBy: typeof approvedBy === "string" && approvedBy.trim() ? approvedBy : null,
    lastEval: lastEval && typeof lastEval === "object" ? (lastEval as unknown as EvalResult) : null,
  };
}
