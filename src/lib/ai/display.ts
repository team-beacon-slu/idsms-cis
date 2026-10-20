import type { AiSettings } from "@/lib/ai/settings";

// Pure view-model for the faculty Review page (FR-AI-07). Reads only cached
// columns (FR-AI-05) and applies NFR-AI-04's confidence floor.
export function getAdvisoryView(
  report: {
    similarityFlag: boolean;
    similarityScore: unknown;
    sentimentLabel: string | null;
    sentimentConfidence: unknown;
    sentimentReasoning: string | null;
    aiProcessedAt: Date | null;
  },
  settings: AiSettings
) {
  const confidence = report.sentimentConfidence == null ? null : Number(report.sentimentConfidence);
  return {
    similarity:
      report.similarityFlag && report.similarityScore != null
        ? { score: Number(report.similarityScore) }
        : null,
    sentiment:
      report.sentimentLabel && confidence !== null && confidence >= settings.minSentimentConfidence
        ? { label: report.sentimentLabel, confidence, reasoning: report.sentimentReasoning }
        : null,
    pending: settings.enabled && report.aiProcessedAt === null,
  };
}
