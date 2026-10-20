import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import {
  MAX_CONDUCT_HOURS,
  setDeductionMatrix,
  setDefaultConductHours,
} from "@/lib/services/deductionService";
import { deductionMatrixSchema } from "@/lib/validators/deductionMatrix";
import { handleApiError } from "@/lib/utils/apiError";

const bodySchema = z.object({
  matrix: z.unknown().optional(),
  defaultHours: z.number().optional(),
});

// Workstream L2: Super Admin edits the deduction matrix and/or the default
// hours per conduct record. Each part is validated by its service.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const { matrix, defaultHours } = bodySchema.parse(await req.json());
    // Validate both parts before saving either, so a bad value saves nothing.
    if (matrix !== undefined) deductionMatrixSchema.parse(matrix);
    if (defaultHours !== undefined) z.number().min(0).max(MAX_CONDUCT_HOURS).parse(defaultHours);
    if (matrix !== undefined) await setDeductionMatrix(matrix, user.id);
    if (defaultHours !== undefined) await setDefaultConductHours(defaultHours, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
