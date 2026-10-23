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
      // Submitted weeks only: drafts are also PENDING and would crowd out real work.
      revisionHistory: { array_contains: [{ type: "SUBMITTED" }] },
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
    // More than `limit`: reports still waiting on an earlier week are skipped
    // without a provider call, so they must not fill the whole window.
    take: limit * 5,
    select: { id: true, studentProfileId: true },
  });

  let processed = 0;
  let failed = 0;
  const failedStudents = new Set<string>();
  for (const { id, studentProfileId } of candidates) {
    if (processed + failed >= limit) break; // the cap counts provider calls only
    // Its later weeks would wait on the failed one anyway; leave them for the next run.
    if (failedStudents.has(studentProfileId)) continue;
    try {
      const result = await processWeeklyReportAi(id);
      if (result.processed) processed += 1;
      else if (result.reason === "Rejected by the AI provider") failed += 1;
    } catch (error) {
      console.error("AI processing failed", { weeklyReportId: id, error });
      failed += 1;
      failedStudents.add(studentProfileId);
    }
  }
  return { processed, failed, skipped: false };
}
