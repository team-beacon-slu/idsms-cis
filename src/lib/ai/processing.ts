import { prisma } from "@/lib/prisma";
import { classifySentiment, embedTexts } from "@/lib/services/aiService";
import { getAiSettings } from "@/lib/ai/settings";
import { getLatestSubmission } from "@/lib/services/weeklyReportService";

// FR-AI-01/02/03/05. Advisory only (FR-AI-06): this function may write the
// cached AI columns and embeddings — never status, hours, or review fields.
// Throws on provider failure WITHOUT writing aiProcessedAt, so the next cron
// run retries the report.
export async function processWeeklyReportAi(weeklyReportId: string): Promise<{
  processed: boolean;
  reason?: string;
  similarityScore?: number | null;
  sentimentLabel?: string;
}> {
  const settings = await getAiSettings();
  if (!settings.enabled) return { processed: false, reason: "AI is disabled" };

  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    select: {
      id: true,
      studentProfileId: true,
      weekStart: true,
      revisionHistory: true,
      aiProcessedAt: true,
      studentProfile: { select: { fullName: true } },
      dailyEntries: { select: { id: true, accomplishments: true } },
    },
  });
  if (!report) return { processed: false, reason: "Report not found" };
  if (!getLatestSubmission(report.revisionHistory)) {
    return { processed: false, reason: "Report not submitted" };
  }
  // Once per submission (resubmitting clears aiProcessedAt), so re-posting
  // the route can't burn the Gemini quota or rewrite a reviewed advisory.
  if (report.aiProcessedAt) return { processed: false, reason: "Already processed" };
  // Similarity compares against earlier weeks' embeddings, so those go first
  // (the cron runs oldest first); otherwise this week would never be compared.
  const earlierPending = await prisma.weeklyReport.count({
    where: {
      studentProfileId: report.studentProfileId,
      weekStart: { lt: report.weekStart },
      aiProcessedAt: null,
      revisionHistory: { array_contains: [{ type: "SUBMITTED" }] },
    },
  });
  if (earlierPending > 0) return { processed: false, reason: "Earlier weeks not processed yet" };

  const names = report.studentProfile.fullName ? [report.studentProfile.fullName] : [];
  const texts = report.dailyEntries.filter((e) => e.accomplishments?.trim());

  // 1. Embed the week's days in one call and store them in the pgvector
  //    column (raw SQL — Prisma has no vector type; see migrations_manual/001).
  const vectors = await embedTexts(
    texts.map((e) => e.accomplishments!),
    { names }
  );
  for (let i = 0; i < texts.length; i += 1) {
    await prisma.$executeRaw`
      UPDATE daily_report_entries
      SET embedding_vector = ${`[${vectors[i].join(",")}]`}::vector
      WHERE id = ${texts[i].id}::uuid`;
  }

  // 2. Highest cosine similarity between this report's days and any day from
  //    the same student's EARLIER reports (FR-AI-01). NULL when there's
  //    nothing earlier to compare against.
  const [row] = await prisma.$queryRaw<{ max_similarity: number | null }[]>`
    SELECT MAX(1 - (cur.embedding_vector <=> prev.embedding_vector))::float8 AS max_similarity
    FROM daily_report_entries cur
    JOIN daily_report_entries prev ON prev.embedding_vector IS NOT NULL
    JOIN weekly_reports pw ON pw.id = prev.weekly_report_id
    WHERE cur.weekly_report_id = ${report.id}::uuid
      AND cur.embedding_vector IS NOT NULL
      AND pw.student_profile_id = ${report.studentProfileId}::uuid
      AND pw.week_start < ${report.weekStart}`;
  const similarityScore =
    row?.max_similarity == null ? null : Math.round(Number(row.max_similarity) * 1000) / 1000;

  // 3. Sentiment over the whole week (FR-AI-03). Stored even when below the
  //    display threshold — NFR-AI-04 suppression happens at render time.
  const sentiment = texts.length
    ? await classifySentiment(texts.map((e) => e.accomplishments).join("\n"), { names })
    : null;

  await prisma.weeklyReport.update({
    where: { id: report.id },
    data: {
      similarityScore,
      similarityFlag: similarityScore !== null && similarityScore > settings.similarityThreshold,
      sentimentLabel: sentiment?.label ?? null,
      sentimentConfidence: sentiment?.confidence ?? null,
      sentimentReasoning: sentiment?.reasoning ?? null,
      aiProcessedAt: new Date(),
    },
  });

  return { processed: true, similarityScore, sentimentLabel: sentiment?.label };
}
