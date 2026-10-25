import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { evaluateThreshold, type EvalResult, type LabeledScore } from "@/lib/ai/evaluation";
import { AI_KEYS, getAiSettings, THRESHOLD_MAX, THRESHOLD_MIN } from "@/lib/ai/settings";
import { getConnections } from "@/lib/ai/connections";
import { cosine } from "@/lib/ai/golden";
import { GOLDEN_SET } from "@/lib/ai/testsets";
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
