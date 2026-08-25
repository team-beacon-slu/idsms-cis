import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth/errors";
import { ForbiddenError } from "@/lib/services/userService";
import { InvalidFileError } from "@/lib/storage";
import { ChecklistGateError, ChecklistLockedError } from "@/lib/services/checklistService";
import { InvalidMoaTransitionError } from "@/lib/services/companyService";
import { WorkPlanPendingError } from "@/lib/services/workPlanService";

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", issues: error.issues }, { status: 400 });
  }
  if (error instanceof InvalidFileError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ChecklistGateError || error instanceof ChecklistLockedError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof InvalidMoaTransitionError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof WorkPlanPendingError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
