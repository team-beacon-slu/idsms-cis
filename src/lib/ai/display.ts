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
  // Turning AI off (e.g. privacy approval withdrawn) hides cached advisories too.
  if (!settings.enabled) return { similarity: null, sentiment: null, pending: false };
  const confidence = report.sentimentConfidence == null ? null : Number(report.sentimentConfidence);
  const score = report.similarityScore == null ? null : Number(report.similarityScore);
  return {
    // Compared with the current threshold, so recalibrating applies to old reports too.
    similarity: score !== null && score > settings.similarityThreshold ? { score } : null,
    sentiment:
      report.sentimentLabel && confidence !== null && confidence >= settings.minSentimentConfidence
        ? { label: report.sentimentLabel, confidence, reasoning: report.sentimentReasoning }
        : null,
    pending: settings.enabled && report.aiProcessedAt === null,
  };
}
