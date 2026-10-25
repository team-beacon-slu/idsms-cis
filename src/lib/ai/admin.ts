import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { evaluateThreshold, type EvalResult, type LabeledScore } from "@/lib/ai/evaluation";
import { AI_KEYS, getAiSettings, THRESHOLD_MAX, THRESHOLD_MIN } from "@/lib/ai/settings";
import { getConnections } from "@/lib/ai/connections";
import { cosine } from "@/lib/ai/golden";
import { GOLDEN_SET, SEARCH_EVAL } from "@/lib/ai/testsets";
import { embedTexts } from "@/lib/services/ai/aiService";

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

async function upsertConfig(configKey: string, configValue: unknown, actingUserId: string | null) {
  await prisma.systemConfig.upsert({
    where: { configKey },
    create: {
      configKey,
      configValue: configValue as Prisma.InputJsonValue,
      updatedBy: actingUserId,
    },
    update: { configValue: configValue as Prisma.InputJsonValue, updatedBy: actingUserId },
  });
}

async function loadGoldenScores(): Promise<LabeledScore[]> {
  const row = await prisma.systemConfig.findUnique({
    where: { configKey: AI_KEYS.goldenScores },
    select: { configValue: true },
  });
  if (!Array.isArray(row?.configValue)) {
    throw new AiConfigError(
      "No golden-set scores yet — run scripts/ai-golden-eval.ts first (NFR-AI-01)"
    );
  }
  return row!.configValue as unknown as LabeledScore[];
}

function assertRange(threshold: number) {
  if (!(threshold >= THRESHOLD_MIN && threshold <= THRESHOLD_MAX)) {
    throw new AiConfigError(
      `Threshold must be between ${THRESHOLD_MIN} and ${THRESHOLD_MAX} (FR-AI-02)`
    );
  }
}

// NFR-AI-03 step 1: show the figures before anything changes.
export async function previewThreshold(threshold: number): Promise<EvalResult> {
  assertRange(threshold);
  return evaluateThreshold(await loadGoldenScores(), threshold);
}

// NFR-AI-03 step 2: confirm — stores threshold + its eval, audit-logged.
export async function setThreshold(threshold: number, actingUserId: string): Promise<EvalResult> {
  const result = await previewThreshold(threshold);
  // NFR-AI-02 holds while AI runs: no switching to a failing threshold.
  if ((await getAiSettings()).enabled && !result.passes) {
    throw new AiConfigError(
      "This threshold fails the precision/recall targets (NFR-AI-02). Disable AI first, or pick a passing value"
    );
  }
  await upsertConfig(AI_KEYS.threshold, threshold, actingUserId);
  // Same golden scores, so the same model they were measured on.
  const model = (await getAiSettings()).lastEval?.model;
  await upsertConfig(AI_KEYS.lastEval, { ...result, model }, actingUserId);
  await logEvent({
    userId: actingUserId,
    action: "AI_THRESHOLD_CHANGED",
    entityType: "SystemConfig",
    detail: {
      threshold,
      precision: result.precision,
      recall: result.recall,
      passes: result.passes,
    },
  });
  return result;
}

// D5 gate. Disabling is always allowed. Each job then has its own gate (lib/ai/jobs.ts):
// copy detection needs its golden-set test passed on its model (NFR-AI-02).
export async function setAiEnabled(
  enabled: boolean,
  privacyApprovedBy: string | null,
  actingUserId: string
) {
  if (enabled) {
    if (!privacyApprovedBy?.trim()) {
      throw new AiConfigError("Record who approved the data-privacy basis (D5) before enabling AI");
    }
    await upsertConfig(AI_KEYS.privacyApprovedBy, privacyApprovedBy.trim(), actingUserId);
  }
  await upsertConfig(AI_KEYS.enabled, enabled, actingUserId);
  await logEvent({
    userId: actingUserId,
    action: enabled ? "AI_ENABLED" : "AI_DISABLED",
    entityType: "SystemConfig",
    detail: { privacyApprovedBy: privacyApprovedBy ?? null },
  });
}

// R3 / guardrail 3: run the golden set on the copy-detection connection from the panel
// (or the script). One batch call; stores the scores, the result and the model it ran on.
export async function runGoldenEval(actingUserId: string | null): Promise<EvalResult> {
  const { private: conn } = await getConnections();
  if (!conn) throw new AiConfigError("Set the connection that may read interns' words first");
  const texts = GOLDEN_SET.flatMap((r) => [r.textA, r.textB]);
  const vectors = await embedTexts(conn, texts);
  const scores: LabeledScore[] = GOLDEN_SET.map((r, i) => ({
    score: Math.round(cosine(vectors[2 * i], vectors[2 * i + 1]) * 1000) / 1000,
    label: r.label,
  }));
  const { similarityThreshold } = await getAiSettings();
  const result = { ...evaluateThreshold(scores, similarityThreshold), model: conn.embeddingModel };
  await upsertConfig(AI_KEYS.goldenScores, scores, actingUserId);
  await upsertConfig(AI_KEYS.lastEval, result, actingUserId);
  await logEvent({
    userId: actingUserId,
    action: "AI_GOLDEN_EVAL_RUN",
    entityType: "SystemConfig",
    detail: {
      model: result.model,
      precision: result.precision,
      recall: result.recall,
      passes: result.passes,
    },
  });
  return result;
}

export interface SearchEvalResult {
  model: string;
  queries: number;
  precisionAt5: number; // share of the top 5 that come from the right demo company
  minRelevantScore: number; // the lowest score a right hit had: guides search.ts MIN_SCORE
  evaluatedAt: string;
}

// RAG review: run SEARCH_EVAL against the demo interns' stored vectors (the nightly job
// must have embedded them first). Read-only apart from storing the result.
export async function runSearchEval(actingUserId: string | null): Promise<SearchEvalResult> {
  const { private: conn } = await getConnections();
  if (!conn) throw new AiConfigError("Set the connection that may read interns' words first");
  const vectors = await embedTexts(
    conn,
    SEARCH_EVAL.map((q) => q.query)
  );
  let hits = 0;
  let total = 0;
  const relevant: number[] = [];
  for (const [i, q] of SEARCH_EVAL.entries()) {
    const vector = `[${vectors[i].join(",")}]`;
    const rows = await prisma.$queryRaw<{ company: string; score: number }[]>`
      SELECT c.name AS company, (1 - (e.embedding_vector <=> ${vector}::vector))::float8 AS score
      FROM daily_report_entries e
      JOIN weekly_reports w ON w.id = e.weekly_report_id
      JOIN student_profiles sp ON sp.id = w.student_profile_id
      JOIN users u ON u.id = sp.user_id
      JOIN companies c ON c.id = sp.company_id
      WHERE e.embedding_vector IS NOT NULL AND u.email LIKE ${"%@demo.idsms.local"}
      ORDER BY e.embedding_vector <=> ${vector}::vector
      LIMIT 5`;
    if (!rows.length) {
      throw new AiConfigError("No demo entries are embedded yet: let the nightly job run first");
    }
    for (const r of rows) {
      total += 1;
      if (r.company === q.company) {
        hits += 1;
        relevant.push(Number(r.score));
      }
    }
  }
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const result: SearchEvalResult = {
    model: conn.embeddingModel,
    queries: SEARCH_EVAL.length,
    precisionAt5: round(hits / total),
    minRelevantScore: round(relevant.length ? Math.min(...relevant) : 0),
    evaluatedAt: new Date().toISOString(),
  };
  await upsertConfig("ai:search_eval", result, actingUserId);
  await logEvent({
    userId: actingUserId,
    action: "AI_SEARCH_EVAL_RUN",
    entityType: "SystemConfig",
    detail: { ...result },
  });
  return result;
}
