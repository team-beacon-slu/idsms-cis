import { NextResponse } from "next/server";
import { AiConfigError } from "@/lib/ai/admin";
import { AiProviderError } from "@/lib/services/ai/aiService";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { TimeRequestStateError } from "@/lib/services/attendance/timeRequestService";
import { ConductStateError } from "@/lib/services/conduct/conductService";
import { UnauthorizedError } from "@/lib/auth/errors";
import { ForbiddenError, OnboardingError } from "@/lib/services/accounts/userService";
import { InvalidFileError } from "@/lib/storage";
import {
  DocumentNotReadyError,
  FinalReportLockedError,
  FinalReportStateError,
} from "@/lib/documents/errors";
import { EndorsementDataIncompleteError } from "@/lib/documents/endorsementLetterData";
import { ChecklistGateError } from "@/lib/services/predeployment/checklistService";
import {
  CompanyStateError,
  InvalidMoaTransitionError,
} from "@/lib/services/predeployment/companyService";
import {
  WorkPlanPendingError,
  WorkPlanStateError,
} from "@/lib/services/predeployment/workPlanService";
import {
  CompanyHolidayError,
  HolidayNotFoundError,
  InvalidScheduleChangeCoordinatorStateError,
  InvalidScheduleChangeStateError,
  MissingScheduleChangeRequestError,
  ScheduleAlreadyConfiguredError,
  ScheduleChangePendingError,
  ScheduleNotConfiguredError,
  WorkPlanNotApprovedError,
} from "@/lib/services/attendance/attendanceService";
import { SemesterStateError } from "@/lib/services/academic/semesterService";
import { ClassGroupStateError } from "@/lib/services/academic/classGroupService";
import {
  ComplianceNotFoundError,
  DataRequestStateError,
  RetentionStateError,
} from "@/lib/errors/compliance";
import {
  DailyEntryDateError,
  LateSubmissionReasonRequiredError,
  WeeklyReportIncompleteError,
  WeeklyReportLockedError,
  WeeklyReportNotAwaitingReviewError,
} from "@/lib/services/reports/weeklyReportService";

// Student-facing business-rule violations from Phase 3's attendance and
// weekly-report flows. Each carries a message written for the student, so
// the client can show it verbatim.
const BAD_REQUEST_ERRORS = [
  OnboardingError,
  WorkPlanNotApprovedError,
  ScheduleAlreadyConfiguredError,
  ScheduleNotConfiguredError,
  ScheduleChangePendingError,
  WeeklyReportLockedError,
  WeeklyReportIncompleteError,
  LateSubmissionReasonRequiredError,
  DailyEntryDateError,
  CompanyHolidayError,
  DocumentNotReadyError,
  EndorsementDataIncompleteError,
  FinalReportLockedError,
  AiConfigError,
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
  // request.json() on a malformed body: the client's mistake, not a server failure.
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  // The AI service failed or is misconfigured: say so plainly (its message never holds the key).
  if (error instanceof AiProviderError) {
    return NextResponse.json(
      { error: `The AI service didn't answer: ${error.message}` },
      { status: 502 }
    );
  }
  if (error instanceof InvalidFileError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ChecklistGateError) {
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
  if (
    error instanceof SemesterStateError ||
    error instanceof ClassGroupStateError ||
    error instanceof CompanyStateError ||
    error instanceof FinalReportStateError ||
    error instanceof DataRequestStateError ||
    error instanceof RetentionStateError ||
    error instanceof TimeRequestStateError ||
    error instanceof ConductStateError ||
    error instanceof WorkPlanStateError ||
    error instanceof WeeklyReportNotAwaitingReviewError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof HolidayNotFoundError || error instanceof ComplianceNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  // findUniqueOrThrow on an unknown id.
  // A unique constraint (e.g. an email already in use) is the caller's conflict, not a crash.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "That record already exists" }, { status: 409 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
