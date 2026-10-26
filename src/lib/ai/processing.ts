import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chatJson, embedTexts } from "@/lib/services/ai/aiService";
import { getAiSettings } from "@/lib/ai/settings";
import { allJobStatuses, markEmbeddedWith, runJob, type JobId } from "@/lib/ai/jobs";
import { buildPrompt, isAddressedToAi, verifiedQuote } from "@/lib/ai/guard";
import { getLatestSubmission } from "@/lib/services/reports/weeklyReportService";
import type { AiConnection } from "@/lib/ai/connections";

// What the nightly job caches on weekly_reports.ai_hints. Advisory only (FR-AI-06):
// this module writes the AI columns and embeddings, never status, hours or review fields.
export interface AiHints {
  similar?: { entryId: string; prevEntryId: string; prevDate: string; score: number };
  tone?: { entryId: string; quote: string }; // "worth a look", adviser only
  summary?: { entryId: string; quote: string }[]; // the intern's own sentences
  coverage?: { missing: string[]; weeks: number }; // planned tasks not found in entries
  addressedToAi?: string[]; // entries with text aimed at the AI: never quoted
}

const COVERAGE_WEEKS = 4;
const COVERAGE_MIN = 0.62; // below this, a planned task counts as "not found"

// Each job runs only if it is on (lib/ai/jobs.ts); a job that's off is skipped and the
// rest still run. Throws on provider failure WITHOUT writing aiProcessedAt, so the next
// cron run retries the report.
export async function processWeeklyReportAi(weeklyReportId: string): Promise<{
  processed: boolean;
  reason?: string;
  similarityScore?: number | null;
}> {
  const statuses = await allJobStatuses();
  const on = (job: JobId) => statuses.find((s) => s.job === job)!;
  const reportJobs: JobId[] = ["copy", "search", "coverage", "tone", "summary"];
  if (!reportJobs.some((j) => on(j).on)) return { processed: false, reason: "AI is off" };

  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    select: {
      id: true,
      studentProfileId: true,
      weekStart: true,
      revisionHistory: true,
      aiProcessedAt: true,
      studentProfile: { select: { fullName: true } },
      dailyEntries: {
        select: { id: true, accomplishments: true, reportDate: true },
        orderBy: { reportDate: "asc" },
      },
    },
  });
  if (!report) return { processed: false, reason: "Report not found" };
  if (!getLatestSubmission(report.revisionHistory)) {
    return { processed: false, reason: "Report not submitted" };
  }
  // Once per submission (resubmitting clears aiProcessedAt), so re-posting can't burn the
  // quota or rewrite a reviewed advisory.
  if (report.aiProcessedAt) return { processed: false, reason: "Already processed" };
  // Similarity compares against earlier weeks' embeddings, so those go first.
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
  const days = report.dailyEntries.filter((e) => e.accomplishments?.trim()) as {
    id: string;
    accomplishments: string;
    reportDate: Date;
  }[];
  const hints: AiHints = {};
  const aimed = days.filter((d) => isAddressedToAi(d.accomplishments)).map((d) => d.id);
  if (aimed.length) hints.addressedToAi = aimed;
  const readable = days.filter((d) => !aimed.includes(d.id));

  try {
    let similarityScore: number | null = null;
    // The embedding jobs share one connection (and one set of vectors); failures count
    // against the first of them that is on.
    const embedJob = (["copy", "search", "coverage"] as JobId[]).map(on).find((s) => s.on);
    const embedConn = embedJob?.connection;
    if (embedJob && embedConn && days.length) {
      await embedWeek(report.id, days, names, embedConn, embedJob.job);
      if (on("copy").on) {
        hints.similar = await mostSimilarEarlierDay(report);
        similarityScore = hints.similar?.score ?? null;
      }
      if (on("coverage").on) {
        hints.coverage = await planCoverage(report, names, embedConn);
      }
    }
    if (on("tone").on && readable.length) {
      hints.tone = await runJob("tone", () => toneHint(readable, names, on("tone").connection!));
    }
    if (on("summary").on && readable.length) {
      hints.summary = await runJob("summary", () => summary(readable, on("summary").connection!));
    }

    const { similarityThreshold } = await getAiSettings();
    await prisma.weeklyReport.update({
      where: { id: report.id },
      data: {
        similarityScore,
        similarityFlag: similarityScore !== null && similarityScore > similarityThreshold,
        aiHints: hints as unknown as Prisma.InputJsonValue,
        aiProcessedAt: new Date(),
      },
    });
    return { processed: true, similarityScore };
  } catch (error) {
    // 400: the provider rejected this content, and retrying won't change that. Record it,
    // or this week (and every later week of the intern) waits forever. Anything else
    // (quota, outage, bad key) stays retryable.
    if ((error as { status?: number }).status !== 400) throw error;
    await prisma.weeklyReport.update({
      where: { id: report.id },
      data: {
        similarityScore: null,
        similarityFlag: false,
        aiHints: Prisma.JsonNull,
        aiProcessedAt: new Date(),
      },
    });
    return { processed: false, reason: "Rejected by the AI provider" };
  }
}

async function embedWeek(
  reportId: string,
  days: { id: string; accomplishments: string }[],
  names: string[],
  conn: AiConnection,
  job: JobId
) {
  // Old vectors go first, so a day emptied on resubmission stops comparing as its old text.
  await prisma.$executeRaw`
    UPDATE daily_report_entries SET embedding_vector = NULL
    WHERE weekly_report_id = ${reportId}::uuid`;
  const vectors = await runJob(job, () =>
    embedTexts(
      conn,
      days.map((d) => d.accomplishments),
      { names }
    )
  );
  for (let i = 0; i < days.length; i += 1) {
    await prisma.$executeRaw`
      UPDATE daily_report_entries
      SET embedding_vector = ${`[${vectors[i].join(",")}]`}::vector
      WHERE id = ${days[i].id}::uuid`;
  }
  await markEmbeddedWith(conn.embeddingModel);
}

// Job 3: the closest pair (this week's day, an earlier week's day of the same intern).
async function mostSimilarEarlierDay(report: {
  id: string;
  studentProfileId: string;
  weekStart: Date;
}): Promise<AiHints["similar"]> {
  const [row] = await prisma.$queryRaw<
    { cur_id: string; prev_id: string; prev_date: Date; score: number }[]
  >`
    SELECT cur.id AS cur_id, prev.id AS prev_id, prev.report_date AS prev_date,
           (1 - (cur.embedding_vector <=> prev.embedding_vector))::float8 AS score
    FROM daily_report_entries cur
    JOIN daily_report_entries prev ON prev.embedding_vector IS NOT NULL
    JOIN weekly_reports pw ON pw.id = prev.weekly_report_id
    WHERE cur.weekly_report_id = ${report.id}::uuid
      AND cur.embedding_vector IS NOT NULL
      AND pw.student_profile_id = ${report.studentProfileId}::uuid
      AND pw.week_start < ${report.weekStart}
    ORDER BY cur.embedding_vector <=> prev.embedding_vector
    LIMIT 1`;
  if (!row) return undefined;
  return {
    entryId: row.cur_id,
    prevEntryId: row.prev_id,
    prevDate: new Date(row.prev_date).toISOString().slice(0, 10),
    score: Math.round(Number(row.score) * 1000) / 1000,
  };
}

// Jobs 4+10: planned tasks (from the approved work plan) with no matching entry in the
// last 4 submitted weeks. Says "not found", never "not done".
async function planCoverage(
  report: { id: string; studentProfileId: string; weekStart: Date },
  names: string[],
  conn: AiConnection
): Promise<AiHints["coverage"]> {
  const { studentProfileId } = report;
  const plan = await prisma.workPlan.findFirst({
    where: { studentProfileId, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: { plannedTasks: true },
  });
  const tasks = z
    .array(z.object({ description: z.string() }))
    .catch([])
    .parse(plan?.plannedTasks)
    .map((t) => t.description.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (!tasks.length) return undefined;
  const weeks = await prisma.weeklyReport.findMany({
    where: { studentProfileId, aiProcessedAt: { not: null }, weekStart: { lt: report.weekStart } },
    orderBy: { weekStart: "desc" },
    take: COVERAGE_WEEKS - 1, // plus the week being processed
    select: { id: true },
  });
  if (weeks.length < COVERAGE_WEEKS - 1) return undefined; // too early to say
  const weekIds = [report.id, ...weeks.map((w) => w.id)];
  const taskVectors = await runJob("coverage", () => embedTexts(conn, tasks, { names }));
  const missing: string[] = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const [row] = await prisma.$queryRaw<{ best: number | null }[]>`
      SELECT MAX(1 - (e.embedding_vector <=> ${`[${taskVectors[i].join(",")}]`}::vector))::float8 AS best
      FROM daily_report_entries e
      WHERE e.weekly_report_id = ANY(${weekIds}::uuid[])
        AND e.embedding_vector IS NOT NULL`;
    if (row?.best == null || Number(row.best) < COVERAGE_MIN) missing.push(tasks[i]);
  }
  return { missing, weeks: COVERAGE_WEEKS };
}

const toneSchema = z.object({ id: z.number().int().nullable(), quote: z.string().nullable() });

// Job 2: one phrase worth a look (stress, safety, being mistreated, being idle), quoted
// exactly; or nothing. Never a score, never shown to the intern.
async function toneHint(
  days: { id: string; accomplishments: string }[],
  _names: string[],
  conn: AiConnection
): Promise<AiHints["tone"]> {
  const prompt = buildPrompt(
    "Find at most ONE short phrase that an internship adviser should look at: signs of stress, " +
      "safety problems, being mistreated, or being left with no work. Most weeks have none. " +
      "Copy the phrase exactly as written. Do not judge the student.",
    days.map((d) => d.accomplishments),
    '{"id": <entry id or null>, "quote": "<exact phrase or null>"}'
  );
  const parsed = toneSchema.safeParse(await chatJson(conn, prompt));
  if (!parsed.success || parsed.data.id == null) return undefined;
  const day = days[parsed.data.id - 1];
  const quote = day && verifiedQuote(parsed.data.quote, day.accomplishments);
  return day && quote ? { entryId: day.id, quote } : undefined;
}

const summarySchema = z.object({
  quotes: z.array(z.object({ id: z.number().int(), quote: z.string() })).max(5),
});

// Job 1: 2–3 of the intern's own sentences, each linked to its day. No new prose.
async function summary(
  days: { id: string; accomplishments: string }[],
  conn: AiConnection
): Promise<AiHints["summary"]> {
  const prompt = buildPrompt(
    "Pick the 2 or 3 sentences that best show what this student did this week. " +
      "Copy each sentence exactly, word for word. Do not write anything of your own.",
    days.map((d) => d.accomplishments),
    '{"quotes": [{"id": <entry id>, "quote": "<exact sentence>"}]}'
  );
  const parsed = summarySchema.safeParse(await chatJson(conn, prompt));
  if (!parsed.success) return undefined;
  const out: { entryId: string; quote: string }[] = [];
  for (const q of parsed.data.quotes) {
    const day = days[q.id - 1];
    const quote = day && verifiedQuote(q.quote, day.accomplishments);
    if (day && quote && out.length < 3) out.push({ entryId: day.id, quote });
  }
  return out.length ? out : undefined;
}
