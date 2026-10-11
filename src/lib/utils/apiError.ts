import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth/errors";
import { ForbiddenError } from "@/lib/services/userService";
import { InvalidFileError } from "@/lib/storage";
import { DocumentNotReadyError } from "@/lib/documents/errors";
import { ChecklistGateError, ChecklistLockedError } from "@/lib/services/checklistService";
import { InvalidMoaTransitionError } from "@/lib/services/companyService";
import { WorkPlanPendingError } from "@/lib/services/workPlanService";
import {
  HolidayNotFoundError,
  InvalidScheduleChangeCoordinatorStateError,
  InvalidScheduleChangeStateError,
  MissingScheduleChangeRequestError,
  ScheduleAlreadyConfiguredError,
  ScheduleChangePendingError,
  ScheduleNotConfiguredError,
  WorkPlanNotApprovedError,
} from "@/lib/services/attendanceService";
import {
  LateSubmissionReasonRequiredError,
  WeeklyReportIncompleteError,
  WeeklyReportLockedError,
} from "@/lib/services/weeklyReportService";

// Student-facing business-rule violations from Phase 3's attendance and
// weekly-report flows. Each carries a message written for the student, so
// the client can show it verbatim.
const BAD_REQUEST_ERRORS = [
  WorkPlanNotApprovedError,
  ScheduleAlreadyConfiguredError,
  ScheduleNotConfiguredError,
  ScheduleChangePendingError,
  WeeklyReportLockedError,
  WeeklyReportIncompleteError,
  LateSubmissionReasonRequiredError,
  DocumentNotReadyError,
];

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
  if (error instanceof InvalidScheduleChangeStateError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof MissingScheduleChangeRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof InvalidScheduleChangeCoordinatorStateError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (BAD_REQUEST_ERRORS.some((ErrorClass) => error instanceof ErrorClass)) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  if (error instanceof HolidayNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
