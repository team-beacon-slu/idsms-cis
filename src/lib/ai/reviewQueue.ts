import { prisma } from "@/lib/prisma";
import { isAwaitingReview, getLatestSubmission } from "@/lib/services/reports/weeklyReportService";
import { vagueDays } from "@/lib/ai/clarity";
import type { AiHints } from "@/lib/ai/processing";
import type { JobId } from "@/lib/ai/jobs";

// Job 7: the adviser's review queue. Flagged weeks first, and every row says why. The
// rules (vague days) work with no model; AI reasons join when their jobs are on.
export function queueReasons(
  report: {
    aiHints: unknown;
    similarityScore: unknown;
    dailyEntries: { id: string; accomplishments: string | null; toolsUsed: string | null }[];
  },
  ctx: { on: ReadonlySet<JobId>; similarityThreshold: number }
): string[] {
  const reasons: string[] = [];
  const hints = (report.aiHints ?? {}) as AiHints;
  const score = report.similarityScore == null ? null : Number(report.similarityScore);
  if (ctx.on.has("copy") && score !== null && score > ctx.similarityThreshold) {
    reasons.push("A day is very similar to an earlier week");
  }
  if (hints.addressedToAi?.length) reasons.push("An entry is addressed to the AI");
  if (ctx.on.has("tone") && hints.tone) reasons.push("A phrase is worth a look");
  if (ctx.on.has("coverage") && hints.coverage?.missing.length) {
    reasons.push(`${hints.coverage.missing.length} planned task(s) not found in entries`);
  }
  const vague = vagueDays(
    report.dailyEntries.map((e) => ({
      id: e.id,
      text: e.accomplishments ?? "",
      tools: e.toolsUsed,
    }))
  ).length;
  if (vague) reasons.push(`${vague} vague day${vague > 1 ? "s" : ""}`);
  return reasons;
}

export async function getReviewQueue(
  facultyId: string,
  ctx: { on: ReadonlySet<JobId>; similarityThreshold: number }
) {
  const pairs = await prisma.facultyClassGroup.findMany({
    where: { facultyId, semester: { archivedAt: null } },
    select: { classGroupId: true, semesterId: true },
  });
  if (!pairs.length) return [];
  const reports = await prisma.weeklyReport.findMany({
    where: {
      status: "PENDING",
      revisionHistory: { array_contains: [{ type: "SUBMITTED" }] },
      studentProfile: {
        deletedAt: null,
        OR: pairs.map((p) => ({ classGroupId: p.classGroupId, semesterId: p.semesterId })),
      },
    },
    select: {
      id: true,
      status: true,
      weekStart: true,
      revisionHistory: true,
      aiHints: true,
      similarityScore: true,
      studentProfileId: true,
      studentProfile: { select: { fullName: true, studentNumber: true } },
      dailyEntries: { select: { id: true, accomplishments: true, toolsUsed: true } },
    },
  });
  return reports
    .filter(isAwaitingReview)
    .map((r) => ({
      id: r.id,
      studentProfileId: r.studentProfileId,
      intern: r.studentProfile.fullName ?? r.studentProfile.studentNumber,
      weekStart: r.weekStart,
      submittedAt: getLatestSubmission(r.revisionHistory)?.timestamp ?? null,
      reasons: queueReasons(r, ctx),
    }))
    .sort(
      (a, b) =>
        b.reasons.length - a.reasons.length ||
        String(a.submittedAt ?? "").localeCompare(String(b.submittedAt ?? ""))
    );
}
