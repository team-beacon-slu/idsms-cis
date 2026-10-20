import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { evaluateThreshold, type EvalResult, type LabeledScore } from "@/lib/ai/evaluation";
import { AI_KEYS, getAiSettings, THRESHOLD_MAX, THRESHOLD_MIN } from "@/lib/ai/settings";

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

async function upsertConfig(configKey: string, configValue: unknown, actingUserId: string) {
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
  await upsertConfig(AI_KEYS.threshold, threshold, actingUserId);
  await upsertConfig(AI_KEYS.lastEval, result, actingUserId);
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

// D5 + NFR-AI-02 gate. Disabling is always allowed.
export async function setAiEnabled(
  enabled: boolean,
  privacyApprovedBy: string | null,
  actingUserId: string
) {
  if (enabled) {
    if (!privacyApprovedBy?.trim()) {
      throw new AiConfigError("Record who approved the data-privacy basis (D5) before enabling AI");
    }
    const settings = await getAiSettings();
    const evalRow = await prisma.systemConfig.findUnique({
      where: { configKey: AI_KEYS.lastEval },
      select: { configValue: true },
    });
    const lastEval = evalRow?.configValue as unknown as EvalResult | undefined;
    if (!lastEval?.passes || lastEval.threshold !== settings.similarityThreshold) {
      throw new AiConfigError(
        "A passing golden-set evaluation (≥80% precision, ≥70% recall, ≥30 pairs) at the current threshold is required (NFR-AI-02)"
      );
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
