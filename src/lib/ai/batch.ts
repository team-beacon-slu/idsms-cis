import { WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAiSettings } from "@/lib/ai/settings";
import { processWeeklyReportAi } from "@/lib/ai/processing";

// Daily catch-up (FR-NT-05's single Hobby cron). Sequential and capped to
// stay inside Gemini free-tier rate limits and the function's maxDuration.
export async function processPendingAiReports(limit = 20) {
  const settings = await getAiSettings();
  if (!settings.enabled) return { processed: 0, failed: 0, skipped: true };

  const candidates = await prisma.weeklyReport.findMany({
    where: {
      aiProcessedAt: null,
      status: {
        in: [
          WeeklyReportStatus.PENDING,
          WeeklyReportStatus.APPROVED,
          WeeklyReportStatus.REGARDED,
          WeeklyReportStatus.RETURNED,
        ],
      },
    },
    orderBy: { weekStart: "asc" },
    take: limit,
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;
  for (const { id } of candidates) {
    try {
      const result = await processWeeklyReportAi(id);
      if (result.processed) processed += 1;
    } catch (error) {
      console.error("AI processing failed", { weeklyReportId: id, error });
      failed += 1;
    }
  }
  return { processed, failed, skipped: false };
}
