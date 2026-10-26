import type { AiHints } from "@/lib/ai/processing";
import type { JobId } from "@/lib/ai/jobs";

// Pure view-model for the adviser's Review page (FR-AI-07). Reads only the cached hints
// (FR-AI-05) and shows a hint only while its job is on: switching a job off (ratings,
// a broken connection, an admin) hides its old hints too.
export interface AdvisoryView {
  pending: boolean;
  similar: {
    entryId: string;
    date: string;
    prevEntryId: string;
    prevDate: string;
    score: number;
  } | null;
  tone: { entryId: string; date: string; quote: string } | null;
  summary: { entryId: string; date: string; quote: string }[];
  coverage: { missing: string[]; weeks: number } | null;
  addressedToAi: { entryId: string; date: string }[];
}

export function getAdvisoryView(
  report: {
    aiHints: unknown;
    aiProcessedAt: Date | null;
    dailyEntries: { id: string; reportDate: Date }[];
  },
  ctx: { on: ReadonlySet<JobId>; similarityThreshold: number }
): AdvisoryView {
  const empty: AdvisoryView = {
    pending: false,
    similar: null,
    tone: null,
    summary: [],
    coverage: null,
    addressedToAi: [],
  };
  const reportJobs: JobId[] = ["copy", "coverage", "tone", "summary"];
  if (!reportJobs.some((j) => ctx.on.has(j))) return empty;
  if (!report.aiProcessedAt) return { ...empty, pending: true };

  const hints = (report.aiHints ?? {}) as AiHints;
  const dateOf = (id: string) => {
    const e = report.dailyEntries.find((d) => d.id === id);
    return e ? e.reportDate.toISOString().slice(0, 10) : null;
  };
  const withDate = <T extends { entryId: string }>(h: T | undefined) => {
    const date = h && dateOf(h.entryId);
    return h && date ? { ...h, date } : null;
  };

  const similar = withDate(hints.similar);
  return {
    pending: false,
    // Compared with today's threshold, so recalibrating applies to old reports too.
    similar:
      ctx.on.has("copy") && similar && similar.score > ctx.similarityThreshold ? similar : null,
    tone: ctx.on.has("tone") ? withDate(hints.tone) : null,
    summary: ctx.on.has("summary")
      ? (hints.summary ?? []).map(withDate).filter((h) => h !== null)
      : [],
    coverage: ctx.on.has("coverage") && hints.coverage?.missing.length ? hints.coverage : null,
    addressedToAi: (hints.addressedToAi ?? [])
      .map((entryId) => withDate({ entryId }))
      .filter((h) => h !== null),
  };
}
