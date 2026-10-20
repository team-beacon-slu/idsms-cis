// Workstream L2: the deduction matrix and default hours per conduct record
// (SystemConfig), automatic deduction items, excuses and the per-intern tally.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { DEFAULT_MATRIX, type MatrixCategory } from "@/lib/utils/deductionMatrix";
import { deductionMatrixSchema } from "@/lib/validators/deductionMatrix";

const MATRIX_KEY = "deduction_matrix";
const DEFAULT_HOURS_KEY = "conduct:default_hours";
export const MAX_CONDUCT_HOURS = 40;

async function upsertConfig(
  configKey: string,
  configValue: Prisma.InputJsonValue,
  action: string,
  actingUserId: string
) {
  await prisma.$transaction(async (tx) => {
    const config = await tx.systemConfig.upsert({
      where: { configKey },
      create: { configKey, configValue, updatedBy: actingUserId },
      update: { configValue, updatedBy: actingUserId },
      select: { id: true },
    });
    await logEvent(
      { userId: actingUserId, action, entityType: "SystemConfig", entityId: config.id },
      tx
    );
  });
}

export async function getDeductionMatrix(): Promise<MatrixCategory[]> {
  const config = await prisma.systemConfig.findUnique({
    where: { configKey: MATRIX_KEY },
    select: { configValue: true },
  });
  const parsed = deductionMatrixSchema.safeParse(config?.configValue);
  return parsed.success ? parsed.data : DEFAULT_MATRIX;
}

export async function setDeductionMatrix(input: unknown, actingUserId: string): Promise<void> {
  const matrix = deductionMatrixSchema.parse(input);
  await upsertConfig(MATRIX_KEY, matrix, "DEDUCTION_MATRIX_UPDATED", actingUserId);
}

export async function getDefaultConductHours(): Promise<number> {
  const config = await prisma.systemConfig.findUnique({
    where: { configKey: DEFAULT_HOURS_KEY },
    select: { configValue: true },
  });
  return typeof config?.configValue === "number" ? config.configValue : 0;
}

export async function setDefaultConductHours(hours: number, actingUserId: string): Promise<void> {
  const value = z.number().min(0).max(MAX_CONDUCT_HOURS).parse(hours);
  await upsertConfig(DEFAULT_HOURS_KEY, value, "CONDUCT_DEFAULT_HOURS_UPDATED", actingUserId);
}
