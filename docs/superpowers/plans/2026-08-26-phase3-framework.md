# Phase 3 Framework (Attendance, Reports, Calendar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Phase 3 framework — schema, RBAC-checked API routes, zod validators, and page shells — for Module 5 (Attendance), Module 6 (Weekly/Monthly Reports), and Module 12 (Unified Calendar), with every substantive business-logic function scaffolded as a compiling, wired-in `// TODO(<owner>): <contract>` stub that a named team member implements in a separate PR against their own GitHub issue.

**Architecture:** Four service files (`attendanceService.ts`, `weeklyReportService.ts`, `monthlyReportService.ts`, `calendarService.ts`, replacing the merged Phase-0 `reportService.ts` placeholder and filling in the existing empty `calendarService.ts`), one small addition to the existing `notificationService.ts`, 15 RBAC-checked API routes following the exact `requireUserApi → requireRole/assertCanAccessStudent → zod.parse → service call → handleApiError` shape from Phase 1/2, and 4 page-shell groups with 7 stub client components. Trivial reads (list/get) are implemented for real by this plan; every function carrying actual FR business logic is a typed placeholder stub owned by a named teammate.

**Tech Stack:** Next.js 14 App Router, Prisma 6.19.3, NextAuth v4 database sessions, Zod, Jest + `jest-mock-extended` (`prismaMock`), shadcn/ui 3.8.5.

**Spec:** `docs/superpowers/specs/2026-08-26-phase3-attendance-reports-calendar-design.md`

## Global Constraints

- Never run `prisma migrate dev` — always `npx prisma generate && npx prisma db push` (Phase 1 CONTRIBUTING.md rule).
- Every mutation goes through `prisma.$transaction(async (tx) => {...; await logEvent({...}, tx); return dto;})` — the exact shape in `companyService.ts`.
- Every student-record route/service call reuses `assertCanAccessStudent` from `userService.ts` — never re-derive ownership logic.
- Stub function bodies carry a **structured comment block**, not a one-liner — this is a monolith-modular codebase, and the point of the block is that an implementer never has to grep the repo to find what to wire into:
  ```
  // FR-<ID> — Owner: <github-username>
  // Requirement: <one-sentence paraphrase of the FR text>
  // Connects to: <exact function names + file for every upstream caller and
  //   downstream callee this stub must eventually call>; <exact Prisma model
  //   + field names it reads/writes>
  // Edge cases: <the specific conditions from the FR text, or a schema gap
  //   found while scaffolding, that the implementer must resolve>
  // TODO(<github-username>): <contract — same content as the GitHub issue>
  ```
  followed by a placeholder return of the correct type. Bodies must compile and must NOT throw — callers (routes, tests) rely on a resolvable placeholder.
- Trivial CRUD reads (list/get, no business rule) are implemented for real, not stubbed — matches Phase 2's `listCompanies`/`listMoaRecordsForCompany` precedent.
- Owners (from `PHASE3_TASKS.md`): Danielle=JayPing23, Kenneth=KennethRusselAvaricio, Ulrich=gu457, Matt=AndresBonifaci0, Gillian=2215428-sys, Shantea23=Shantea23, Rhaastas=Rhaastas (unassigned in code comments too — pending org invite).
- No route-level automated tests — Phase 1/2 established RBAC verification via live browser walkthrough, not route unit tests; this plan follows that precedent (see Task 19).

---

### Task 1: Schema diff — drop `scheduleId`, add `periodLabel`

**Files:**

- Modify: `prisma/schema.prisma:214` (`StudentProfile.scheduleId` line)
- Modify: `prisma/schema.prisma:429-441` (`GeneratedDocument` model)

**Interfaces:**

- Produces: `GeneratedDocument.periodLabel: string | null` — consumed by Task 5 (`monthlyReportService.ts`) and Task 4 (`weeklyReportService.ts`'s reference-code stub).

- [ ] **Step 1: Remove the vestigial column**

In `prisma/schema.prisma`, delete this line from the `StudentProfile` model:

```prisma
  scheduleId           String?   @map("schedule_id") @db.Uuid
```

- [ ] **Step 2: Add `periodLabel` to `GeneratedDocument`**

```prisma
model GeneratedDocument {
  id               String         @id @default(uuid()) @db.Uuid
  studentProfileId String         @map("student_profile_id") @db.Uuid
  documentType     DocumentType   @map("document_type")
  fileUrl          String?        @map("file_url")
  referenceCode    String?        @unique @map("reference_code")
  // Disambiguates which week/month a WEEKLY_REPORT or MONTHLY_REPORT row
  // represents (e.g. "2026-08-24" for a week-start, "2026-08" for a
  // calendar month). Null for ENDORSEMENT_LETTER/FINAL_REPORT_COVER.
  periodLabel      String?        @map("period_label")
  generatedAt      DateTime?      @map("generated_at")
  status           DocumentStatus @default(PENDING_DRAFT)

  studentProfile StudentProfile @relation(fields: [studentProfileId], references: [id])

  @@map("generated_documents")
}
```

- [ ] **Step 3: Regenerate the client and push the schema**

Run: `npx prisma generate && npx prisma db push`
Expected: `db push` reports the dropped column and the new column, applies cleanly against the shared Supabase dev DB, and `npx prisma validate` reports no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Phase 3 Stage A: drop vestigial scheduleId, add GeneratedDocument.periodLabel"
```

---

### Task 2: Zod validators — `attendance.ts` and `report.ts`

**Files:**

- Create: `src/lib/validators/attendance.ts`
- Create: `src/lib/validators/report.ts`
- Test: `src/lib/validators/attendance.test.ts`
- Test: `src/lib/validators/report.test.ts`

**Interfaces:**

- Produces: `scheduleConfigSchema`, `scheduleChangeRequestSchema`, `scheduleChangeReviewSchema`, `deviationReportSchema`, `deviationValidateSchema`, `requiredHoursConfigSchema` (from `attendance.ts`); `weeklyReportGenerateSchema`, `dailyEntrySchema`, `weeklyReportSubmitSchema`, `weeklyReportReviewSchema`, `monthlyReportSchema` (from `report.ts`) — consumed by Tasks 8–12's routes.

- [ ] **Step 1: Write the failing validator tests**

`src/lib/validators/attendance.test.ts`:

```typescript
import { DeviationType } from "@prisma/client";
import {
  deviationReportSchema,
  deviationValidateSchema,
  requiredHoursConfigSchema,
  scheduleChangeRequestSchema,
  scheduleChangeReviewSchema,
  scheduleConfigSchema,
} from "@/lib/validators/attendance";

describe("scheduleConfigSchema", () => {
  it("accepts a valid schedule", () => {
    const result = scheduleConfigSchema.parse({ daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 8 });
    expect(result.hoursPerDay).toBe(8);
  });

  it("rejects an empty daysOfWeek array", () => {
    expect(() => scheduleConfigSchema.parse({ daysOfWeek: [], hoursPerDay: 8 })).toThrow();
  });

  it("rejects a day outside 0-6", () => {
    expect(() => scheduleConfigSchema.parse({ daysOfWeek: [7], hoursPerDay: 8 })).toThrow();
  });
});

describe("scheduleChangeRequestSchema", () => {
  it("accepts a valid request", () => {
    const result = scheduleChangeRequestSchema.parse({
      reason: "New shift assigned by supervisor",
      newScheduleConfig: { daysOfWeek: [1, 2, 3], hoursPerDay: 6 },
    });
    expect(result.reason).toBe("New shift assigned by supervisor");
  });

  it("rejects an empty reason", () => {
    expect(() =>
      scheduleChangeRequestSchema.parse({
        reason: "",
        newScheduleConfig: { daysOfWeek: [1], hoursPerDay: 6 },
      })
    ).toThrow();
  });
});

describe("scheduleChangeReviewSchema", () => {
  it("accepts APPROVE and REJECT", () => {
    expect(scheduleChangeReviewSchema.parse({ action: "APPROVE" }).action).toBe("APPROVE");
    expect(scheduleChangeReviewSchema.parse({ action: "REJECT" }).action).toBe("REJECT");
  });

  it("rejects an unknown action", () => {
    expect(() => scheduleChangeReviewSchema.parse({ action: "MAYBE" })).toThrow();
  });
});

describe("deviationReportSchema", () => {
  it("accepts a valid deviation", () => {
    const result = deviationReportSchema.parse({
      date: "2026-08-20",
      deviationType: DeviationType.ABSENCE,
      reason: "Sick",
    });
    expect(result.deviationType).toBe(DeviationType.ABSENCE);
  });

  it("rejects an empty reason", () => {
    expect(() =>
      deviationReportSchema.parse({
        date: "2026-08-20",
        deviationType: DeviationType.ABSENCE,
        reason: "",
      })
    ).toThrow();
  });
});

describe("deviationValidateSchema", () => {
  it("accepts VALIDATE and REJECT", () => {
    expect(deviationValidateSchema.parse({ action: "VALIDATE" }).action).toBe("VALIDATE");
  });
});

describe("requiredHoursConfigSchema", () => {
  it("accepts a positive integer hours value", () => {
    expect(requiredHoursConfigSchema.parse({ program: "BSIT", hours: 600 }).hours).toBe(600);
  });

  it("rejects zero or negative hours", () => {
    expect(() => requiredHoursConfigSchema.parse({ program: "BSIT", hours: 0 })).toThrow();
  });
});
```

`src/lib/validators/report.test.ts`:

```typescript
import {
  dailyEntrySchema,
  monthlyReportSchema,
  weeklyReportGenerateSchema,
  weeklyReportReviewSchema,
  weeklyReportSubmitSchema,
} from "@/lib/validators/report";

describe("weeklyReportGenerateSchema", () => {
  it("coerces a date string", () => {
    const result = weeklyReportGenerateSchema.parse({ weekStart: "2026-08-24" });
    expect(result.weekStart).toBeInstanceOf(Date);
  });
});

describe("dailyEntrySchema", () => {
  it("accepts a valid entry", () => {
    const result = dailyEntrySchema.parse({ hours: 8, accomplishments: "Fixed the login bug" });
    expect(result.hours).toBe(8);
  });

  it("rejects hours above 24", () => {
    expect(() => dailyEntrySchema.parse({ hours: 25, accomplishments: "x" })).toThrow();
  });

  it("rejects empty accomplishments", () => {
    expect(() => dailyEntrySchema.parse({ hours: 8, accomplishments: "" })).toThrow();
  });
});

describe("weeklyReportSubmitSchema", () => {
  it("allows an absent reasonForDelay", () => {
    expect(weeklyReportSubmitSchema.parse({}).reasonForDelay).toBeUndefined();
  });
});

describe("weeklyReportReviewSchema", () => {
  it("accepts all four review actions", () => {
    for (const action of ["APPROVE", "RETURN", "REGARD", "DISREGARD"] as const) {
      expect(weeklyReportReviewSchema.parse({ action }).action).toBe(action);
    }
  });

  it("rejects an unknown action", () => {
    expect(() => weeklyReportReviewSchema.parse({ action: "MAYBE" })).toThrow();
  });
});

describe("monthlyReportSchema", () => {
  it("accepts a YYYY-MM string", () => {
    expect(monthlyReportSchema.parse({ calendarMonth: "2026-08" }).calendarMonth).toBe("2026-08");
  });

  it("rejects a malformed month string", () => {
    expect(() => monthlyReportSchema.parse({ calendarMonth: "August 2026" })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/validators/attendance.test.ts src/lib/validators/report.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validators/attendance'` (and `report`).

- [ ] **Step 3: Write the validators**

`src/lib/validators/attendance.ts`:

```typescript
import { z } from "zod";
import { DeviationType, Program } from "@prisma/client";

export const scheduleConfigSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Select at least one working day"),
  hoursPerDay: z.number().positive(),
});

export const scheduleChangeRequestSchema = z.object({
  reason: z.string().min(1, "A reason is required"),
  newScheduleConfig: scheduleConfigSchema,
  supportingDocumentPath: z.string().min(1).optional(),
});

export const scheduleChangeReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
});

export const deviationReportSchema = z.object({
  date: z.coerce.date(),
  deviationType: z.enum(DeviationType),
  reason: z.string().min(1, "A reason is required"),
  proofUrl: z.string().min(1).optional(),
});

export const deviationValidateSchema = z.object({
  action: z.enum(["VALIDATE", "REJECT"]),
});

export const requiredHoursConfigSchema = z.object({
  program: z.enum(Program),
  hours: z.number().int().positive(),
});
```

`src/lib/validators/report.ts`:

```typescript
import { z } from "zod";

export const weeklyReportGenerateSchema = z.object({
  weekStart: z.coerce.date(),
});

export const dailyEntrySchema = z.object({
  hours: z.number().min(0).max(24),
  accomplishments: z.string().min(1, "Accomplishments are required"),
});

export const weeklyReportSubmitSchema = z.object({
  reasonForDelay: z.string().min(1).optional(),
});

export const weeklyReportReviewSchema = z.object({
  action: z.enum(["APPROVE", "RETURN", "REGARD", "DISREGARD"]),
  notes: z.string().min(1).optional(),
});

export const monthlyReportSchema = z.object({
  calendarMonth: z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM"),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/validators/attendance.test.ts src/lib/validators/report.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/attendance.ts src/lib/validators/attendance.test.ts src/lib/validators/report.ts src/lib/validators/report.test.ts
git commit -m "Phase 3 Stage C: attendance and report zod validators"
```

---

### Task 3: `attendanceService.ts` — Module 5 scaffold (15 stubs)

**Files:**

- Create: `src/lib/services/attendanceService.ts`
- Test: `src/lib/services/attendanceService.test.ts`

**Interfaces:**

- Consumes: `assertCanAccessStudent(actingUser, studentProfileId)` from `@/lib/services/userService`; `logEvent(input, client?)` from `@/lib/services/auditService`; `prisma` from `@/lib/prisma`.
- Produces: `ConfigureWorkScheduleInput`, `configureWorkSchedule`, `HolidayCalendarEntryDTO`, `getHolidayCalendarForStudent`, `markHolidayApplicable`, `SubmitDeviationReportInput`, `submitDeviationReport`, `listDeviationReportsForStudent`, `validateDeviationReport`, `computeTotalHoursRendered`, `computeProjectedCompletionDate`, `getRequiredHoursConfig`, `setRequiredHoursConfig`, `exportAttendanceLogCsv`, `RequestScheduleChangeInput`, `requestScheduleChange`, `validateScheduleChangeFaculty`, `approveScheduleChangeCoordinator`, `applyScheduleChangeProspectively`, `ScheduleChangeHistoryEntry`, `logScheduleChangeHistory` — consumed by Task 8–10's routes.

- [ ] **Step 1: Write the failing smoke test**

```typescript
import { DeviationType, Program, Role, ValidationStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  applyScheduleChangeProspectively,
  approveScheduleChangeCoordinator,
  computeProjectedCompletionDate,
  computeTotalHoursRendered,
  configureWorkSchedule,
  exportAttendanceLogCsv,
  getHolidayCalendarForStudent,
  getRequiredHoursConfig,
  listDeviationReportsForStudent,
  logScheduleChangeHistory,
  markHolidayApplicable,
  requestScheduleChange,
  setRequiredHoursConfig,
  submitDeviationReport,
  validateDeviationReport,
  validateScheduleChangeFaculty,
} from "@/lib/services/attendanceService";

const studentUser = { id: "student-1", role: Role.STUDENT_INTERN };

beforeEach(() => {
  resetPrismaMock();
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    userId: "student-1",
    classGroupId: "cg-1",
    semesterId: "sem-1",
  } as never);
});

describe("attendanceService stubs — reachable and wired correctly", () => {
  // TODO(JayPing23): replace each of these placeholder-return assertions
  // once the real logic behind it lands (see PHASE3_TASKS.md for owners).
  it("configureWorkSchedule resolves without throwing", async () => {
    const result = await configureWorkSchedule(
      "profile-1",
      { daysOfWeek: [1, 2, 3], hoursPerDay: 8 },
      studentUser
    );
    expect(result.studentProfileId).toBe("profile-1");
  });

  it("getHolidayCalendarForStudent resolves an array", async () => {
    await expect(getHolidayCalendarForStudent("profile-1")).resolves.toEqual([]);
  });

  it("markHolidayApplicable resolves without throwing", async () => {
    const result = await markHolidayApplicable("profile-1", "holiday-1", true, studentUser);
    expect(result.applicable).toBe(true);
  });

  it("submitDeviationReport resolves a PENDING placeholder", async () => {
    const result = await submitDeviationReport(
      "profile-1",
      { date: new Date(), deviationType: DeviationType.ABSENCE, reason: "Sick" },
      studentUser
    );
    expect(result.validationStatus).toBe(ValidationStatus.PENDING);
  });

  it("listDeviationReportsForStudent calls prisma with the right filter", async () => {
    prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
    await listDeviationReportsForStudent("profile-1");
    expect(prismaMock.deviationReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentProfileId: "profile-1" } })
    );
  });

  it("validateDeviationReport resolves without throwing", async () => {
    const result = await validateDeviationReport("dev-1", "faculty-1", "VALIDATE");
    expect(result.id).toBe("dev-1");
  });

  it("computeTotalHoursRendered resolves a number", async () => {
    await expect(computeTotalHoursRendered("profile-1")).resolves.toBe(0);
  });

  it("computeProjectedCompletionDate resolves null", async () => {
    await expect(computeProjectedCompletionDate("profile-1")).resolves.toBeNull();
  });

  it("getRequiredHoursConfig resolves a number", async () => {
    await expect(getRequiredHoursConfig(Program.BSIT)).resolves.toBe(0);
  });

  it("setRequiredHoursConfig echoes its input", async () => {
    const result = await setRequiredHoursConfig(Program.BSIT, 600, "admin-1");
    expect(result.hours).toBe(600);
  });

  it("exportAttendanceLogCsv resolves a CSV header string", async () => {
    const csv = await exportAttendanceLogCsv("profile-1");
    expect(csv).toContain("date,scheduledHours,actualHours,status");
  });

  it("requestScheduleChange resolves a pending status", async () => {
    const result = await requestScheduleChange(
      "profile-1",
      { reason: "New shift", newScheduleConfig: { daysOfWeek: [1], hoursPerDay: 6 } },
      studentUser
    );
    expect(result.status).toBe("PENDING_FACULTY");
  });

  it("validateScheduleChangeFaculty resolves without throwing", async () => {
    const result = await validateScheduleChangeFaculty("wp-1", "faculty-1", "APPROVE");
    expect(result.workPlanId).toBe("wp-1");
  });

  it("approveScheduleChangeCoordinator resolves without throwing", async () => {
    const result = await approveScheduleChangeCoordinator("wp-1", "coord-1", "APPROVE");
    expect(result.workPlanId).toBe("wp-1");
  });

  it("applyScheduleChangeProspectively resolves an effective date", async () => {
    const result = await applyScheduleChangeProspectively("wp-1");
    expect(result.effectiveFrom).toBeInstanceOf(Date);
  });

  it("logScheduleChangeHistory resolves without throwing", async () => {
    await expect(
      logScheduleChangeHistory("wp-1", {
        timestamp: new Date().toISOString(),
        approverId: null,
        action: "REQUESTED",
      })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/services/attendanceService.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/attendanceService'`.

- [ ] **Step 3: Write the scaffold**

```typescript
// Attendance & schedule configuration, deviation reports, hour computation,
// mid-internship schedule changes. See PRD Module 5 (FR-AT-*).
import {
  DeviationType,
  Prisma,
  PrismaClient,
  Program,
  Role,
  ValidationStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { assertCanAccessStudent } from "@/lib/services/userService";

export interface ConfigureWorkScheduleInput {
  daysOfWeek: number[]; // 0=Sunday..6=Saturday
  hoursPerDay: number;
}

// FR-AT-01 — Owner: KennethRusselAvaricio
// Requirement: upon work plan approval, each student configures their work
// schedule (daily hours, working days).
// Connects to: called by POST /api/students/[studentProfileId]/schedule
// (Task 9 route). Writes `WorkPlan.scheduleConfig` (Json field on the
// `work_plans` table, prisma.workPlan.update inside a $transaction) — read
// `WorkPlan.status` (WorkPlanStatus enum) first. Log via
// `logEvent({ action: "SCHEDULE_CONFIGURED", entityType: "WorkPlan", ... })`
// from auditService.ts.
// Edge cases: no WorkPlan with status APPROVED exists yet for this student
// (throw, don't silently no-op); scheduleConfig already set (decide
// overwrite vs. reject — FR-AT-01 doesn't specify, this is a call for the
// implementer to make and document).
export async function configureWorkSchedule(
  studentProfileId: string,
  input: ConfigureWorkScheduleInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ studentProfileId: string; scheduleConfig: ConfigureWorkScheduleInput }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void ipAddress;
  return { studentProfileId, scheduleConfig: input };
}

export interface HolidayCalendarEntryDTO {
  id: string;
  date: Date;
  name: string;
  applicable: boolean;
}

// FR-AT-02 — Owner: 2215428-sys (Gillian)
// Requirement: populate a calendar-based schedule pre-populated with
// Philippine national/regional holidays and company-specific non-working
// days that students can mark as applicable.
// Connects to: reads `HolidayCalendarEntry` (`holiday_calendar` table) two
// ways — rows with `semesterId` set and `studentProfileId` null are
// system-wide (national/regional); rows with `studentProfileId` set are the
// per-student override `markHolidayApplicable` below writes, reachable via
// `StudentProfile.holidayOverrides`. Consumed by
// `weeklyReportService.generateWeeklyReportForm` (Task 4, to skip
// non-working days) and by `attendance/page.tsx` (Task 14).
// Edge cases: SCHEMA GAP found while scaffolding — `HolidayCalendarEntry`
// has no boolean "applicable" field. There's no company-specific
// non-working-day source in the schema either (`Company` has no such
// field). Implementer must decide: does a per-student override row mean
// "this holiday doesn't apply to me" (row = opt-out) or "this is an extra
// non-working day for me" (row = opt-in)? Whichever is chosen must be
// documented in this JSDoc and reflected in `markHolidayApplicable` below —
// don't add a new schema field without raising it with Danielle first
// (`ScheduleId`-style vestige risk).
export async function getHolidayCalendarForStudent(
  studentProfileId: string
): Promise<HolidayCalendarEntryDTO[]> {
  // TODO(2215428-sys): implement per the contract above.
  void studentProfileId;
  return [];
}

// FR-AT-02 — Owner: 2215428-sys (Gillian)
// Requirement: students can mark a pre-populated holiday as applicable/not
// applicable to their own schedule.
// Connects to: writes the same `HolidayCalendarEntry` rows
// `getHolidayCalendarForStudent` above reads (via
// `StudentProfile.holidayOverrides`) — whatever override representation is
// chosen there must match here exactly (create/delete/update a row with
// `studentProfileId` set to this student).
// Edge cases: same schema-gap note as `getHolidayCalendarForStudent` — this
// function's implementation is coupled to that decision.
export async function markHolidayApplicable(
  studentProfileId: string,
  holidayEntryId: string,
  applicable: boolean,
  actingUser: { id: string; role: Role }
): Promise<{ holidayEntryId: string; applicable: boolean }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(2215428-sys): implement per the contract above.
  return { holidayEntryId, applicable };
}

export interface SubmitDeviationReportInput {
  date: Date;
  deviationType: DeviationType;
  reason: string;
  proofUrl?: string;
}

// FR-AT-03 — Owner: KennethRusselAvaricio
// Requirement: absences/undertime/overtime submitted via a structured
// deviation report form with date, reason category, and optional proof upload.
// Connects to: called by POST /api/students/[studentProfileId]/deviations
// (Task 10 route, which also handles the file upload via
// `src/lib/storage.ts`'s `uploadFile`, Phase 2 pattern, before calling this).
// Creates a `DeviationReport` row (`deviation_reports` table) — fields
// `date`, `deviationType` (`DeviationType` enum: ABSENCE/OVERTIME/UNDERTIME),
// `reason`, `proofUrl`, `validationStatus` (start `PENDING`). Log via
// `logEvent({ action: "DEVIATION_SUBMITTED", entityType: "DeviationReport" })`.
// Edge cases: none beyond the standard $transaction + logEvent pattern.
export async function submitDeviationReport(
  studentProfileId: string,
  input: SubmitDeviationReportInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ id: string; validationStatus: ValidationStatus }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void input;
  void ipAddress;
  return { id: "", validationStatus: ValidationStatus.PENDING };
}

// Trivial read — not a stub, matches Phase 2's listCompanies precedent.
export async function listDeviationReportsForStudent(studentProfileId: string) {
  return prisma.deviationReport.findMany({
    where: { studentProfileId },
    orderBy: { date: "desc" },
  });
}

// FR-AT-04 — Owner: KennethRusselAvaricio
// Requirement: all deviation reports must be validated by the faculty
// adviser before affecting hour computation.
// Connects to: called by PATCH /api/deviations/[id]/validate (Task 10
// route, Faculty/Coordinator/Admin-gated). Sets
// `DeviationReport.validationStatus` (`ValidationStatus` enum:
// PENDING/VALIDATED/REJECTED — note it is VALIDATED, not APPROVED) and
// `DeviationReport.facultyId`. Downstream: `computeTotalHoursRendered`
// below must filter on `validationStatus === VALIDATED` only.
// Edge cases: a REJECTED row must never be readable by
// `computeTotalHoursRendered` — this is the whole point of the gate.
export async function validateDeviationReport(
  deviationReportId: string,
  facultyId: string,
  action: "VALIDATE" | "REJECT",
  ipAddress?: string | null
): Promise<{ id: string; validationStatus: ValidationStatus }> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void facultyId;
  void action;
  void ipAddress;
  return { id: deviationReportId, validationStatus: ValidationStatus.PENDING };
}

// FR-AT-05 — Owner: JayPing23 (Danielle)
// Requirement: automatically compute total hours rendered, based only on
// validated attendance data. This is the system's central value metric —
// every other module's "hours" display reads from this.
// Connects to: reads `DailyReportEntry.actualHours` (via `WeeklyReport`,
// only rows with `WeeklyReportStatus` APPROVED or REGARDED — see
// `weeklyReportService.ts`'s review actions, Task 4) plus `DeviationReport`
// rows with `validationStatus === VALIDATED` (`deviationType` OVERTIME
// adds, ABSENCE/UNDERTIME subtract — see `validateDeviationReport` above).
// Writes the result to `StudentProfile.renderedHours` (Decimal field,
// currently unwritten anywhere in the codebase — confirmed via
// `grep -rn renderedHours src/` during spec research). Called by GET
// /api/students/[studentProfileId]/attendance-summary (Task 11) and by
// `reviewWeeklyReport_Approve`/`_Regard` (Task 4) after each approval.
// Edge cases: must never read PENDING/RETURNED/DISREGARDED WeeklyReport
// rows, or PENDING/REJECTED DeviationReport rows.
export async function computeTotalHoursRendered(studentProfileId: string): Promise<number> {
  // TODO(JayPing23): implement per the contract above.
  void studentProfileId;
  return 0;
}

// FR-AT-05 — Owner: JayPing23 (Danielle)
// Requirement: automatically compute required hours remaining and a
// projected completion date, based only on validated attendance data.
// Connects to: calls `computeTotalHoursRendered` above; reads
// `StudentProfile.requiredHours` (Int) and the active schedule from
// `WorkPlan.scheduleConfig` (post any `applyScheduleChangeProspectively`
// change further down this file). Called by the same attendance-summary
// route (Task 11) and by `calendarService.detectEndorsementLetterSpikes`
// (Task 7, which clusters these dates across students).
// Edge cases: return null when no APPROVED WorkPlan/schedule exists yet —
// there's nothing to project against.
export async function computeProjectedCompletionDate(
  studentProfileId: string
): Promise<Date | null> {
  // TODO(JayPing23): implement per the contract above.
  void studentProfileId;
  return null;
}

const REQUIRED_HOURS_CONFIG_KEY = (program: Program) => `required_hours:${program}`;

// FR-AT-06 — Owner: 2215428-sys (Gillian)
// Requirement: required completion hours per program must be configurable
// via the admin interface, never hardcoded.
// Connects to: called by GET /api/config/required-hours (Task 11). Reads
// `SystemConfig.configValue` (Json) where `configKey === REQUIRED_HOURS_CONFIG_KEY(program)`
// (`system_config` table, unique on `configKey`).
// Edge cases: fall back to a documented default only if unset — don't throw.
export async function getRequiredHoursConfig(program: Program): Promise<number> {
  // TODO(2215428-sys): implement per the contract above.
  void program;
  return 0;
}

// FR-AT-06 — Owner: 2215428-sys (Gillian)
// Requirement: same as above, the write side.
// Connects to: called by PATCH /api/config/required-hours (Task 11,
// Super Admin only — enforced by the route's `requireRole`, this function
// trusts that gate the same way `companyService.updateCompany` does).
// Upserts `SystemConfig` at `REQUIRED_HOURS_CONFIG_KEY(program)`.
// Edge cases: must NOT retroactively alter already-provisioned
// `StudentProfile.requiredHours` values (those are set once, at bulk-import
// time, per Phase 1's `userService.bulkImportStudents`) — this only changes
// the default for *future* imports.
export async function setRequiredHoursConfig(
  program: Program,
  hours: number,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ program: Program; hours: number }> {
  // TODO(2215428-sys): implement per the contract above.
  void actingUserId;
  void ipAddress;
  return { program, hours };
}

// FR-AT-07 — Owner: Shantea23
// Requirement: students can export their attendance log as CSV.
// Connects to: called by GET /api/students/[studentProfileId]/attendance-export
// (Task 11 route, which sets the CSV response headers — this function only
// returns the CSV body as a string). Reads `DailyReportEntry` rows (via
// this student's `WeeklyReport`s) for `reportDate`, `scheduledHours`,
// `actualHours`, `attendanceStatus`.
// Edge cases: none — read-only formatting.
export async function exportAttendanceLogCsv(studentProfileId: string): Promise<string> {
  // TODO(Shantea23): implement per the contract above.
  void studentProfileId;
  return "date,scheduledHours,actualHours,status\n";
}

export interface RequestScheduleChangeInput {
  reason: string;
  newScheduleConfig: ConfigureWorkScheduleInput;
  supportingDocumentPath?: string;
}

// FR-AT-08 — Owner: Rhaastas (org invite pending — GitHub issue #13
// created unassigned; assign once they accept)
// Requirement: students may request a mid-internship schedule change via a
// structured form, requiring a valid reason and supporting document if applicable.
// Connects to: called by PATCH /api/students/[studentProfileId]/schedule
// (Task 9 route). Must call `logScheduleChangeHistory` (bottom of this
// file) to append a `{ status: "PENDING_FACULTY" }` entry to this
// student's latest `WorkPlan.scheduleChangeHistory` (Json array). The
// resulting pending request is picked up next by
// `validateScheduleChangeFaculty` below.
// Edge cases: if a supporting document was uploaded, the route has already
// called `uploadFile` (Phase 2 `storage.ts` pattern) and passed the
// resulting path in `input.supportingDocumentPath`.
export async function requestScheduleChange(
  studentProfileId: string,
  input: RequestScheduleChangeInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: "PENDING_FACULTY" }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(Rhaastas): implement per the contract above.
  void input;
  void ipAddress;
  return { workPlanId: "", status: "PENDING_FACULTY" };
}

// FR-AT-09 (step 1 of 2) — Owner: JayPing23 (Danielle)
// Requirement: schedule changes require Faculty Adviser validation followed
// by Department Coordinator final approval — this is step 1.
// Connects to: called by PATCH
// /api/work-plans/[id]/schedule-change/faculty-review (Task 9 route,
// Faculty-only). On APPROVE, advances the pending request (written by
// `requestScheduleChange` above) to `PENDING_COORDINATOR`, for
// `approveScheduleChangeCoordinator` below to pick up. On REJECT, the
// request is terminal — no further action. Log via
// `logScheduleChangeHistory`.
// Edge cases: must only act on a request currently `PENDING_FACULTY` —
// reject/throw if called on a request in any other state.
export async function validateScheduleChangeFaculty(
  workPlanId: string,
  facultyId: string,
  action: "APPROVE" | "REJECT",
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: string }> {
  // TODO(JayPing23): implement per the contract above.
  void facultyId;
  void action;
  void ipAddress;
  return { workPlanId, status: "PENDING_FACULTY" };
}

// FR-AT-09 (step 2 of 2) — Owner: JayPing23 (Danielle)
// Requirement: step 2 — Department Coordinator final approval.
// Connects to: called by PATCH
// /api/work-plans/[id]/schedule-change/coordinator-review (Task 9 route,
// Coordinator/Admin-only). Only callable once
// `validateScheduleChangeFaculty` above set status `PENDING_COORDINATOR`.
// On final APPROVE, calls `applyScheduleChangeProspectively` below. Log via
// `logScheduleChangeHistory`.
// Edge cases: reject/throw if called on a request not currently
// `PENDING_COORDINATOR`.
export async function approveScheduleChangeCoordinator(
  workPlanId: string,
  coordinatorId: string,
  action: "APPROVE" | "REJECT",
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: string }> {
  // TODO(JayPing23): implement per the contract above.
  void coordinatorId;
  void action;
  void ipAddress;
  return { workPlanId, status: "PENDING_COORDINATOR" };
}

// FR-AT-10 — Owner: JayPing23 (Danielle)
// Requirement: approved schedule changes do NOT retroactively alter
// previously validated hours or reports — they only affect future hour
// computation and update the projected completion date.
// Connects to: called internally by `approveScheduleChangeCoordinator`
// above (not its own route). Swaps the active `WorkPlan.scheduleConfig` for
// future-dated computation only. Must trigger
// `computeProjectedCompletionDate` (above) to recompute after applying.
// Edge cases: must NOT touch any already-computed `WeeklyReport` or
// `DailyReportEntry` row — this is the "prospective, not retroactive" rule
// FR-AT-10 exists to enforce.
export async function applyScheduleChangeProspectively(
  workPlanId: string
): Promise<{ workPlanId: string; effectiveFrom: Date }> {
  // TODO(JayPing23): implement per the contract above.
  return { workPlanId, effectiveFrom: new Date() };
}

export interface ScheduleChangeHistoryEntry {
  timestamp: string;
  approverId: string | null;
  action: string;
  [key: string]: unknown;
}

// FR-AT-11 — Owner: KennethRusselAvaricio
// Requirement: all schedule changes are logged in
// `work_plans.scheduleChangeHistory` with timestamps and approver IDs.
// Connects to: called internally by `requestScheduleChange`,
// `validateScheduleChangeFaculty`, `approveScheduleChangeCoordinator`, and
// `applyScheduleChangeProspectively` (all above in this file) — never
// exposed as its own route. Appends `entry` to `WorkPlan.scheduleChangeHistory`
// (Json array, `@default("[]")`).
// Edge cases: none — pure append, no read-modify-write race handling needed
// beyond what `$transaction` already gives every other mutation in this file.
export async function logScheduleChangeHistory(
  workPlanId: string,
  entry: ScheduleChangeHistoryEntry,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<void> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void workPlanId;
  void entry;
  void client;
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/services/attendanceService.test.ts`
Expected: PASS, 15 stub smoke assertions + 1 real read test green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/attendanceService.ts src/lib/services/attendanceService.test.ts
git commit -m "Phase 3 Stage B: attendanceService.ts scaffold (Module 5, 15 stubs)"
```

---

### Task 4: `weeklyReportService.ts` — Module 6 weekly scaffold (11 stubs + 2 reads)

**Files:**

- Create: `src/lib/services/weeklyReportService.ts`
- Test: `src/lib/services/weeklyReportService.test.ts`

**Interfaces:**

- Consumes: same imports as Task 3.
- Produces: `generateWeeklyReportForm`, `calculateWeeklyTotalHours`, `calculateRunningTotalAndRemaining`, `saveDailyAccomplishment`, `validateLateSubmissionReason`, `reviewWeeklyReport_Approve`, `reviewWeeklyReport_Return`, `reviewWeeklyReport_Regard`, `reviewWeeklyReport_Disregard`, `generateReportPdfPreview`, `generateReportReferenceCode`, `listWeeklyReportsForStudent`, `getWeeklyReport` — consumed by Task 11's routes.

- [ ] **Step 1: Write the failing smoke test**

```typescript
import { WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  calculateRunningTotalAndRemaining,
  calculateWeeklyTotalHours,
  generateReportPdfPreview,
  generateReportReferenceCode,
  generateWeeklyReportForm,
  getWeeklyReport,
  listWeeklyReportsForStudent,
  reviewWeeklyReport_Approve,
  reviewWeeklyReport_Disregard,
  reviewWeeklyReport_Regard,
  reviewWeeklyReport_Return,
  saveDailyAccomplishment,
  validateLateSubmissionReason,
} from "@/lib/services/weeklyReportService";

beforeEach(() => resetPrismaMock());

describe("weeklyReportService stubs — reachable and wired correctly", () => {
  // TODO(JayPing23): replace each of these placeholder-return assertions
  // once the real logic behind it lands (see PHASE3_TASKS.md for owners).
  it("generateWeeklyReportForm resolves a week range", async () => {
    const weekStart = new Date("2026-08-24");
    const result = await generateWeeklyReportForm("profile-1", weekStart);
    expect(result.weekStart).toEqual(weekStart);
    expect(result.weekEnd.getTime()).toBeGreaterThan(weekStart.getTime());
  });

  it("calculateWeeklyTotalHours resolves a number", async () => {
    await expect(calculateWeeklyTotalHours("wr-1")).resolves.toBe(0);
  });

  it("calculateRunningTotalAndRemaining resolves a shape", async () => {
    const result = await calculateRunningTotalAndRemaining("profile-1", "wr-1");
    expect(result).toEqual({ runningTotal: 0, remainingHours: 0 });
  });

  it("saveDailyAccomplishment echoes its input", async () => {
    const result = await saveDailyAccomplishment("entry-1", 8, "Fixed a bug", "student-1");
    expect(result.hours).toBe(8);
  });

  it("validateLateSubmissionReason resolves without throwing", async () => {
    await expect(validateLateSubmissionReason("wr-1", "Power outage")).resolves.toBeUndefined();
  });

  it("reviewWeeklyReport_Approve resolves without throwing", async () => {
    const result = await reviewWeeklyReport_Approve("wr-1", "faculty-1");
    expect(result.id).toBe("wr-1");
  });

  it("reviewWeeklyReport_Return resolves without throwing", async () => {
    const result = await reviewWeeklyReport_Return("wr-1", "faculty-1", "Missing Tuesday entry");
    expect(result.status).toBe(WeeklyReportStatus.PENDING);
  });

  it("reviewWeeklyReport_Regard resolves without throwing", async () => {
    const result = await reviewWeeklyReport_Regard("wr-1", "faculty-1");
    expect(result.id).toBe("wr-1");
  });

  it("reviewWeeklyReport_Disregard resolves without throwing", async () => {
    const result = await reviewWeeklyReport_Disregard("wr-1", "faculty-1");
    expect(result.id).toBe("wr-1");
  });

  it("generateReportPdfPreview resolves a null preview", async () => {
    await expect(generateReportPdfPreview("wr-1")).resolves.toEqual({ previewUrl: null });
  });

  it("generateReportReferenceCode resolves a shape", async () => {
    const result = await generateReportReferenceCode("wr-1");
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("listWeeklyReportsForStudent calls prisma with the right filter", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    await listWeeklyReportsForStudent("profile-1");
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentProfileId: "profile-1" } })
    );
  });

  it("getWeeklyReport calls prisma with the right id", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
    await getWeeklyReport("wr-1");
    expect(prismaMock.weeklyReport.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wr-1" } })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/services/weeklyReportService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the scaffold**

```typescript
// Weekly report submission and the four-way faculty review action. See PRD
// Module 6 (FR-WR-01–07, FR-WR-09–10). Monthly aggregation lives in
// monthlyReportService.ts (FR-WR-08).
import { WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// FR-WR-01 — Owner: Shantea23
// Requirement: auto-generate weekly report forms based on each student's
// approved fixed schedule and semester calendar.
// Connects to: called by POST /api/students/[studentProfileId]/weekly-reports
// (Task 12 route, manual "generate this week" fallback). Creates one
// `WeeklyReport` row (unique on `[studentProfileId, weekStart]`) plus one
// `DailyReportEntry` per scheduled working day (`scheduledHours` pre-filled
// from `WorkPlan.scheduleConfig` in `attendanceService.ts`, `actualHours`
// left null), skipping days `attendanceService.getHolidayCalendarForStudent`
// (Task 3) marks non-working.
// Edge cases: violating the `[studentProfileId, weekStart]` unique
// constraint means a report for that week already exists — decide whether
// to return the existing row or throw.
export async function generateWeeklyReportForm(
  studentProfileId: string,
  weekStart: Date
): Promise<{ weeklyReportId: string; weekStart: Date; weekEnd: Date }> {
  // TODO(Shantea23): implement per the contract above.
  void studentProfileId;
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { weeklyReportId: "", weekStart, weekEnd };
}

// FR-WR-02 — Owner: KennethRusselAvaricio
// Requirement: total hours for the week must be auto-calculated.
// Connects to: called by PATCH /api/weekly-reports/[id] (Task 12 route)
// after every `saveDailyAccomplishment` call below, so the client form can
// show a live total. Sums `DailyReportEntry.actualHours` for this report,
// writes `WeeklyReport.totalHours` (Decimal).
// Edge cases: null `actualHours` (not yet filled in) should count as 0, not throw.
export async function calculateWeeklyTotalHours(weeklyReportId: string): Promise<number> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void weeklyReportId;
  return 0;
}

// FR-WR-02 — Owner: KennethRusselAvaricio
// Requirement: running total hours and hours remaining must be auto-calculated.
// Connects to: called from the same PATCH /api/weekly-reports/[id] route as
// `calculateWeeklyTotalHours` above. Writes `WeeklyReport.runningTotal`
// (cumulative across prior APPROVED/REGARDED weeks + this one, Decimal) and
// `WeeklyReport.remainingHours` (against `StudentProfile.requiredHours`).
// Edge cases: only prior weeks with status APPROVED or REGARDED count
// toward the running total — same status filter as
// `attendanceService.computeTotalHoursRendered`.
export async function calculateRunningTotalAndRemaining(
  studentProfileId: string,
  weeklyReportId: string
): Promise<{ runningTotal: number; remainingHours: number }> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void studentProfileId;
  void weeklyReportId;
  return { runningTotal: 0, remainingHours: 0 };
}

// FR-WR-03 — Owner: gu457 (Ulrich)
// Requirement: only the student may enter actual hours worked and daily
// accomplishments.
// Connects to: called by PATCH /api/weekly-reports/[id] (Task 12 route),
// which then calls `calculateWeeklyTotalHours` and
// `calculateRunningTotalAndRemaining` above and returns all three in one
// response. Writes a single `DailyReportEntry` row (`actualHours`,
// `accomplishments`).
// Edge cases: enforce the caller (`studentUserId`) is the owning student —
// self-only, same pattern as `assertCanAccessStudent` elsewhere — and that
// the parent `WeeklyReport.status` is not already
// APPROVED/REGARDED/DISREGARDED (those are locked).
export async function saveDailyAccomplishment(
  dailyReportEntryId: string,
  hours: number,
  accomplishments: string,
  studentUserId: string
): Promise<{ id: string; hours: number; accomplishments: string }> {
  // TODO(gu457): implement per the contract above.
  void studentUserId;
  return { id: dailyReportEntryId, hours, accomplishments };
}

// FR-WR-05 — Owner: Shantea23
// Requirement: reports are due Tuesday; late submissions require the
// student to fill out a mandatory "Reason for Delay" field before the
// system accepts the submission. Faculty can view this note during review.
// Connects to: called by POST /api/weekly-reports/[id]/submit (Task 12
// route) before `generateReportReferenceCode` below. No dedicated schema
// field currently exists for the delay reason — store it in
// `WeeklyReport.revisionHistory` (Json, already used by
// `reviewWeeklyReport_Return` below) or add a field; note whichever choice
// is made here in this comment for `reviewWeeklyReport_*`'s implementers to
// find it.
// Edge cases: no-op (don't throw) if the report is not actually late.
export async function validateLateSubmissionReason(
  weeklyReportId: string,
  reasonForDelay?: string
): Promise<void> {
  // TODO(Shantea23): implement per the contract above.
  void weeklyReportId;
  void reasonForDelay;
  return;
}

// FR-WR-06 (Approve) — Owner: JayPing23 (Danielle)
// Requirement: Faculty can Approve — hours count, status complete.
// Connects to: called by PATCH /api/weekly-reports/[id]/review (Task 12
// route, `action: "APPROVE"`, Faculty-only). Sets `WeeklyReport.status =
// APPROVED` and `facultyAction`. Must call
// `attendanceService.computeTotalHoursRendered` +
// `computeProjectedCompletionDate` (Task 3) afterward, since this report's
// hours now count toward both. The route also calls
// `notificationService.sendReportStatusEmail` (Task 8) after this returns.
// Edge cases: none beyond the status transition itself.
export async function reviewWeeklyReport_Approve(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(JayPing23): implement per the contract above.
  void facultyId;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-06 (Return) — Owner: KennethRusselAvaricio
// Requirement: Faculty can Return — requires student revision, hours do
// not count yet.
// Connects to: called by the same PATCH /api/weekly-reports/[id]/review
// route (`action: "RETURN"`). Sets `WeeklyReport.status = RETURNED`,
// appends `notes` to `WeeklyReport.revisionHistory` (Json array).
// Edge cases: hours must NOT be recomputed — a RETURNED report is excluded
// from `computeTotalHoursRendered`'s status filter by construction.
export async function reviewWeeklyReport_Return(
  weeklyReportId: string,
  facultyId: string,
  notes: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void facultyId;
  void notes;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-06 (Regard) — Owner: KennethRusselAvaricio
// Requirement: Faculty can Regard — acknowledged, hours count, but marked
// for minor improvement/no revision needed.
// Connects to: same review route (`action: "REGARD"`). Sets
// `WeeklyReport.status = REGARDED` — hours count exactly like Approve
// (trigger `computeTotalHoursRendered`/`computeProjectedCompletionDate`,
// Task 3), the status is just visually distinct in the UI.
// Edge cases: none — this is the "same effect as Approve, different label" branch.
export async function reviewWeeklyReport_Regard(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void facultyId;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-06 (Disregard) — Owner: JayPing23 (Danielle)
// Requirement: Faculty can Disregard — invalid submission (e.g. wrong
// week), hours do not count, requires full resubmission.
// Connects to: same review route (`action: "DISREGARD"`). Sets
// `WeeklyReport.status = DISREGARDED`; excluded from
// `computeTotalHoursRendered`. Must clear/reset the row so
// `generateWeeklyReportForm` above can regenerate a fresh form for that
// week without violating the `[studentProfileId, weekStart]` unique constraint.
// Edge cases: deciding "clear vs. delete-and-recreate" for the DISREGARDED
// row is this function's actual design work — document the choice here for
// `generateWeeklyReportForm`'s implementer.
export async function reviewWeeklyReport_Disregard(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(JayPing23): implement per the contract above.
  void facultyId;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-09 — Owner: gu457 (Ulrich)
// Requirement: students must be able to preview a PDF of their report
// before final submission.
// Connects to: called by GET /api/weekly-reports/[id]/preview (Task 12
// route). This is a lightweight preview, NOT the final Puppeteer-rendered
// PDF from Module 8's `documentService.ts` (out of scope for Phase 3 — see
// the design spec's "Out of scope" section).
// Edge cases: none — read-only rendering.
export async function generateReportPdfPreview(
  weeklyReportId: string
): Promise<{ previewUrl: string | null }> {
  // TODO(gu457): implement per the contract above.
  void weeklyReportId;
  return { previewUrl: null };
}

// FR-WR-10 — Owner: Shantea23
// Requirement: a submitted report PDF must be auto-generated with a system
// reference code and timestamp.
// Connects to: called by POST /api/weekly-reports/[id]/submit (Task 12
// route), after `validateLateSubmissionReason` above passes. The actual PDF
// file generation is Module 8's job (out of scope here) — this function
// only produces the reference code + timestamp pair that gets attached to it.
// Edge cases: reference code must be globally unique (matches the pattern
// `GeneratedDocument.referenceCode`'s `@unique` constraint expects, even
// though this function doesn't write to that table directly).
export async function generateReportReferenceCode(
  weeklyReportId: string
): Promise<{ referenceCode: string; timestamp: Date }> {
  // TODO(Shantea23): implement per the contract above.
  void weeklyReportId;
  return { referenceCode: "", timestamp: new Date() };
}

// Trivial reads — not stubs, match Phase 2's listCompanies precedent.
export async function listWeeklyReportsForStudent(studentProfileId: string) {
  return prisma.weeklyReport.findMany({
    where: { studentProfileId },
    orderBy: { weekStart: "desc" },
  });
}

export async function getWeeklyReport(weeklyReportId: string) {
  return prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    include: { dailyEntries: true },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/services/weeklyReportService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/weeklyReportService.ts src/lib/services/weeklyReportService.test.ts
git commit -m "Phase 3 Stage B: weeklyReportService.ts scaffold (Module 6 weekly, 11 stubs)"
```

---

### Task 5: `monthlyReportService.ts` — Module 6 monthly scaffold (2 stubs + 1 read)

**Files:**

- Create: `src/lib/services/monthlyReportService.ts`
- Test: `src/lib/services/monthlyReportService.test.ts`

**Interfaces:**

- Consumes: `prisma` from `@/lib/prisma`; `DocumentType`, `DocumentStatus` from `@prisma/client`.
- Produces: `checkMonthlyAggregationEligibility`, `submitMonthlyReport`, `listMonthlyReportsForStudent` — consumed by Task 12's route.

- [ ] **Step 1: Write the failing smoke test**

```typescript
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  checkMonthlyAggregationEligibility,
  listMonthlyReportsForStudent,
  submitMonthlyReport,
} from "@/lib/services/monthlyReportService";

beforeEach(() => resetPrismaMock());

describe("monthlyReportService stubs — reachable and wired correctly", () => {
  // TODO(JayPing23): replace each of these placeholder-return assertions
  // once the real logic behind it lands.
  it("checkMonthlyAggregationEligibility resolves false", async () => {
    await expect(checkMonthlyAggregationEligibility("profile-1", "2026-08")).resolves.toBe(false);
  });

  it("submitMonthlyReport echoes its calendarMonth", async () => {
    const result = await submitMonthlyReport("profile-1", "2026-08", "actor-1");
    expect(result.calendarMonth).toBe("2026-08");
  });

  it("listMonthlyReportsForStudent calls prisma with the right filter", async () => {
    prismaMock.generatedDocument.findMany.mockResolvedValue([] as never);
    await listMonthlyReportsForStudent("profile-1");
    expect(prismaMock.generatedDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentProfileId: "profile-1" }) })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/services/monthlyReportService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the scaffold**

```typescript
// Monthly report aggregation over weekly reports. See PRD Module 6 (FR-WR-08).
import { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// FR-WR-08 — Owner: JayPing23 (Danielle)
// Requirement: monthly reports aggregate weekly reports by calendar month.
// A monthly report can only be submitted when ALL weekly reports falling
// within that calendar month are Approved or Regarded.
// Connects to: called by POST /api/students/[studentProfileId]/monthly-reports
// (Task 13 route) as the pre-flight gate, before `submitMonthlyReport`
// below. Reads `WeeklyReport` rows (from `weeklyReportService.ts`, Task 4)
// whose `[weekStart, weekEnd]` overlaps `calendarMonth`, checking `status`
// against the same APPROVED/REGARDED filter
// `attendanceService.computeTotalHoursRendered` (Task 3) uses.
// Edge cases: a month with zero weekly reports at all — decide whether
// that's eligible (nothing to block) or ineligible (nothing to aggregate);
// document the choice here.
export async function checkMonthlyAggregationEligibility(
  studentProfileId: string,
  calendarMonth: string // "YYYY-MM"
): Promise<boolean> {
  // TODO(JayPing23): implement per the contract above.
  void studentProfileId;
  void calendarMonth;
  return false;
}

// FR-WR-08 — Owner: JayPing23 (Danielle)
// Requirement: same as above, the actual submission.
// Connects to: called by the same monthly-reports route, only after
// `checkMonthlyAggregationEligibility` above returns true (the route
// enforces this — see Task 13). Creates a `GeneratedDocument` row
// (`documentType: MONTHLY_REPORT`, `status: PENDING_DRAFT`, `periodLabel:
// calendarMonth` — the field Task 1's schema diff added specifically for
// this) inside a `$transaction` with `logEvent`. Read back later by
// `listMonthlyReportsForStudent` below.
// Edge cases: must be idempotent — no duplicate `GeneratedDocument` row for
// the same `studentProfileId` + `periodLabel` (check with `findFirst`
// before creating, same pattern Phase 2's `workPlanService.reviewWorkPlan`
// uses for the endorsement-letter row).
export async function submitMonthlyReport(
  studentProfileId: string,
  calendarMonth: string,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ generatedDocumentId: string; calendarMonth: string }> {
  // TODO(JayPing23): implement per the contract above.
  void studentProfileId;
  void actingUserId;
  void ipAddress;
  return { generatedDocumentId: "", calendarMonth };
}

// Trivial read — not a stub, matches Phase 2's listCompanies precedent.
export async function listMonthlyReportsForStudent(studentProfileId: string) {
  return prisma.generatedDocument.findMany({
    where: { studentProfileId, documentType: DocumentType.MONTHLY_REPORT },
    orderBy: { periodLabel: "desc" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/services/monthlyReportService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/monthlyReportService.ts src/lib/services/monthlyReportService.test.ts
git commit -m "Phase 3 Stage B: monthlyReportService.ts scaffold (Module 6 monthly, 2 stubs)"
```

---

### Task 6: Delete the superseded `reportService.ts` placeholder

**Files:**

- Delete: `src/lib/services/reportService.ts`

**Interfaces:**

- Consumes: none (nothing in the codebase imports from it yet — confirmed by Task 3/4/5 already replacing its scope).

- [ ] **Step 1: Confirm nothing imports it**

Run: `grep -rn "services/reportService" src --include="*.ts" --include="*.tsx"`
Expected: no output (or only this file's own definition, if the grep pattern matches the file path itself — verify no _importer_ exists).

- [ ] **Step 2: Delete the file**

```bash
git rm src/lib/services/reportService.ts
```

- [ ] **Step 3: Verify the build still compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "Phase 3 Stage B: remove reportService.ts, superseded by attendance/weeklyReport/monthlyReportService.ts"
```

---

### Task 7: `calendarService.ts` — Module 12 scaffold (7 stubs)

**Files:**

- Modify: `src/lib/services/calendarService.ts` (currently a one-line header comment only)
- Test: `src/lib/services/calendarService.test.ts`

**Interfaces:**

- Consumes: `Role` from `@prisma/client`.
- Produces: `CalendarEventType`, `CalendarEvent`, `getUnifiedCalendarEvents`, `colorCodeCalendarEvents`, `getStudentCalendarView`, `getFacultyCalendarView`, `detectHighVolumeSubmissionWeeks`, `getCoordinatorCalendarView`, `detectEndorsementLetterSpikes` — consumed by Task 12's route and Task 16's page shell.

- [ ] **Step 1: Write the failing smoke test**

```typescript
import { Role } from "@prisma/client";
import {
  colorCodeCalendarEvents,
  detectEndorsementLetterSpikes,
  detectHighVolumeSubmissionWeeks,
  getCoordinatorCalendarView,
  getFacultyCalendarView,
  getStudentCalendarView,
  getUnifiedCalendarEvents,
} from "@/lib/services/calendarService";

describe("calendarService stubs — reachable and wired correctly", () => {
  // TODO(JayPing23): replace each of these placeholder-return assertions
  // once the real logic behind it lands.
  it("getUnifiedCalendarEvents resolves an empty array", async () => {
    await expect(getUnifiedCalendarEvents("user-1", Role.STUDENT_INTERN)).resolves.toEqual([]);
  });

  it("colorCodeCalendarEvents is a pure passthrough placeholder", () => {
    const events = [{ type: "DEADLINE" as const, date: new Date(), label: "Week 1" }];
    expect(colorCodeCalendarEvents(events)).toBe(events);
  });

  it("getStudentCalendarView resolves an empty array", async () => {
    await expect(getStudentCalendarView("profile-1")).resolves.toEqual([]);
  });

  it("getFacultyCalendarView resolves an empty array", async () => {
    await expect(getFacultyCalendarView("faculty-1")).resolves.toEqual([]);
  });

  it("detectHighVolumeSubmissionWeeks resolves an empty array", async () => {
    await expect(detectHighVolumeSubmissionWeeks("faculty-1")).resolves.toEqual([]);
  });

  it("getCoordinatorCalendarView resolves an empty array", async () => {
    await expect(getCoordinatorCalendarView("coord-1")).resolves.toEqual([]);
  });

  it("detectEndorsementLetterSpikes resolves an empty array", async () => {
    await expect(detectEndorsementLetterSpikes("coord-1")).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/services/calendarService.test.ts`
Expected: FAIL — named exports not found.

- [ ] **Step 3: Write the scaffold**

```typescript
// Unified calendar aggregation across roles. See PRD Module 12 (FR-CAL-*).
import { Role } from "@prisma/client";

export type CalendarEventType = "DEADLINE" | "HOLIDAY" | "DEVIATION" | "COMPLETION";

export interface CalendarEvent {
  type: CalendarEventType;
  date: Date;
  label: string;
  studentProfileId?: string;
  color?: string;
}

// FR-CAL-01 — Owner: JayPing23 (Danielle)
// Requirement: all roles have access to a calendar view displaying
// color-coded events: Submission Deadlines (Red), Holidays (Gray), Approved
// Deviations (Yellow), and Projected OJT Completion Date (Green milestone).
// This is the central aggregator every other function in this file specializes.
// Connects to: called by GET /api/calendar (Task 13 route). Pulls: weekly
// report deadlines from `weeklyReportService.listWeeklyReportsForStudent`
// (Task 4); `HolidayCalendarEntry` rows from
// `attendanceService.getHolidayCalendarForStudent` (Task 3); `DeviationReport`
// rows with `validationStatus === VALIDATED`; and
// `attendanceService.computeProjectedCompletionDate` (Task 3) — into one
// normalized `CalendarEvent[]`, scoped by `role`: STUDENT_INTERN sees own
// data only; FACULTY_ADVISER sees assigned students via
// `FacultyClassGroup`; DEPARTMENT_COORDINATOR/SUPER_ADMIN see the whole
// department.
// Edge cases: role-scoping bugs here are a data-leak risk — a student must
// never see another student's events, so this needs the same rigor as
// `assertCanAccessStudent`, even though it's a read, not a mutation.
export async function getUnifiedCalendarEvents(
  userId: string,
  role: Role
): Promise<CalendarEvent[]> {
  // TODO(JayPing23): implement per the contract above.
  void userId;
  void role;
  return [];
}

// FR-CAL-01 — Owner: AndresBonifaci0 (Matt)
// Requirement: color-code events per the scheme above.
// Connects to: called by GET /api/calendar (Task 13 route) right after
// `getUnifiedCalendarEvents` above, and by `calendar/page.tsx` (Task 17) if
// the route ever needs to re-color a client-side-filtered subset. Pure
// function — sets `CalendarEvent.color`: DEADLINE=red, HOLIDAY=gray,
// DEVIATION=yellow, COMPLETION=green.
// Edge cases: none — no I/O, just a `type → color` map.
export function colorCodeCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  // TODO(AndresBonifaci0): implement per the contract above.
  return events;
}

// FR-CAL-02 — Owner: gu457 (Ulrich)
// Requirement: the student calendar displays the student's specific work
// schedule, upcoming report deadlines, and a prominent, auto-updating
// Projected OJT Completion Date.
// Connects to: consumed by `UnifiedCalendarView` (F5, `calendar/page.tsx`,
// Task 17) when the viewer is a STUDENT_INTERN. Thin wrapper around
// `getUnifiedCalendarEvents` above scoped to one student, layered with
// their `WorkPlan.scheduleConfig` (`attendanceService.ts`, Task 3).
// Edge cases: none beyond what `getUnifiedCalendarEvents` already handles.
export async function getStudentCalendarView(studentProfileId: string): Promise<CalendarEvent[]> {
  // TODO(gu457): implement per the contract above.
  void studentProfileId;
  return [];
}

// FR-CAL-03 — Owner: AndresBonifaci0 (Matt)
// Requirement: the faculty calendar displays aggregated submission
// deadlines for all assigned students, highlighting weeks with high
// expected submission volumes.
// Connects to: consumed by `UnifiedCalendarView` (F5, Task 17) for
// FACULTY_ADVISER viewers. Calls `getUnifiedCalendarEvents` above once per
// student assigned via `FacultyClassGroup` (`faculty_class_groups` table,
// same join Phase 2's `my-students` page already uses) and merges into one
// aggregated array. Feeds `detectHighVolumeSubmissionWeeks` below.
// Edge cases: none beyond the aggregation itself.
export async function getFacultyCalendarView(facultyId: string): Promise<CalendarEvent[]> {
  // TODO(AndresBonifaci0): implement per the contract above.
  void facultyId;
  return [];
}

// FR-CAL-03 — Owner: AndresBonifaci0 (Matt)
// Requirement: highlight weeks with high expected submission volumes.
// Connects to: reads `getFacultyCalendarView`'s output above (call it
// directly, don't re-derive). Buckets DEADLINE-type events by week, flags
// weeks exceeding a configurable threshold (mirror
// `attendanceService.getRequiredHoursConfig`'s `SystemConfig`-lookup
// pattern for the threshold value, or hardcode a documented default —
// implementer's call).
// Edge cases: none.
export async function detectHighVolumeSubmissionWeeks(
  facultyId: string
): Promise<{ weekStart: Date; count: number }[]> {
  // TODO(AndresBonifaci0): implement per the contract above.
  void facultyId;
  return [];
}

// FR-CAL-04 — Owner: AndresBonifaci0 (Matt)
// Requirement: the coordinator calendar displays department-wide
// milestones, MOA expiration dates, and clustered projected completion
// dates to anticipate endorsement letter generation spikes.
// Connects to: consumed by `UnifiedCalendarView` (F5, Task 17) for
// DEPARTMENT_COORDINATOR/SUPER_ADMIN viewers. Merges
// `getUnifiedCalendarEvents`-style events department-wide with
// `companyService.getExpiringMoaRecords` (Phase 2, already exists — reuse
// it, don't re-derive MOA-expiry logic). Feeds
// `detectEndorsementLetterSpikes` below.
// Edge cases: none beyond the merge.
export async function getCoordinatorCalendarView(coordinatorId: string): Promise<CalendarEvent[]> {
  // TODO(AndresBonifaci0): implement per the contract above.
  void coordinatorId;
  return [];
}

// FR-CAL-04 — Owner: JayPing23 (Danielle)
// Requirement: anticipate endorsement letter generation spikes.
// Connects to: reads `getCoordinatorCalendarView`'s COMPLETION-type events
// above (equivalently, calls `attendanceService.computeProjectedCompletionDate`,
// Task 3, per student in the department) and clusters them by week/month to
// flag upcoming load spikes — same "bucket by week, flag over threshold"
// shape as `detectHighVolumeSubmissionWeeks` above, different event type.
// Edge cases: none.
export async function detectEndorsementLetterSpikes(
  coordinatorId: string
): Promise<{ weekStart: Date; expectedCount: number }[]> {
  // TODO(JayPing23): implement per the contract above.
  void coordinatorId;
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/services/calendarService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/calendarService.ts src/lib/services/calendarService.test.ts
git commit -m "Phase 3 Stage B: calendarService.ts scaffold (Module 12, 7 stubs)"
```

---

### Task 8: `notificationService.ts` — add `sendReportStatusEmail` stub

**Files:**

- Modify: `src/lib/services/notificationService.ts` (currently a one-line header comment only)
- Test: `src/lib/services/notificationService.test.ts`

**Interfaces:**

- Produces: `sendReportStatusEmail` — consumed by Task 11's weekly-report review route.

- [ ] **Step 1: Write the failing smoke test**

```typescript
import { sendReportStatusEmail } from "@/lib/services/notificationService";

describe("notificationService stubs — reachable and wired correctly", () => {
  // TODO(unassigned — Rhaastas, org invite pending): replace once FR-NT-04
  // email delivery lands.
  it("sendReportStatusEmail resolves without throwing", async () => {
    await expect(sendReportStatusEmail("wr-1", "APPROVE")).resolves.toEqual({ sent: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/services/notificationService.test.ts`
Expected: FAIL — named export not found.

- [ ] **Step 3: Write the scaffold**

```typescript
// 12 automated notification triggers via Resend. See PRD Module 11 (FR-NT-*).

// FR-WR-07 — Owner: Rhaastas (org invite pending — GitHub issue #27
// created unassigned; assign once they accept)
// Requirement: Faculty and students must receive email notifications when
// reports are approved or returned.
// Connects to: called by PATCH /api/weekly-reports/[id]/review (Task 12
// route) right after `reviewWeeklyReport_Approve`/`_Return`/`_Regard`/
// `_Disregard` (`weeklyReportService.ts`, Task 4) returns. Should use
// Resend + React Email per FR-NT-04's convention (Module 11) — no existing
// Resend client/template setup exists in this codebase yet (Module 11 is
// out of scope for Phase 3), so the real implementation likely needs that
// infrastructure stood up first; flag that dependency rather than silently
// blocking on it.
// Edge cases: none specific to this stub — the "sent: false" placeholder
// intentionally never fails the calling route (the review action itself
// must still succeed even if email delivery isn't implemented yet).
export async function sendReportStatusEmail(
  weeklyReportId: string,
  action: "APPROVE" | "RETURN" | "REGARD" | "DISREGARD"
): Promise<{ sent: boolean }> {
  // TODO(Rhaastas): implement per the contract above.
  void weeklyReportId;
  void action;
  return { sent: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/services/notificationService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/notificationService.ts src/lib/services/notificationService.test.ts
git commit -m "Phase 3 Stage B: notificationService.ts sendReportStatusEmail stub (FR-WR-07)"
```

---

### Task 9: API routes — schedule & schedule-change (3 routes)

**Files:**

- Create: `src/app/api/students/[studentProfileId]/schedule/route.ts`
- Create: `src/app/api/work-plans/[id]/schedule-change/faculty-review/route.ts`
- Create: `src/app/api/work-plans/[id]/schedule-change/coordinator-review/route.ts`

**Interfaces:**

- Consumes: `configureWorkSchedule`, `requestScheduleChange`, `validateScheduleChangeFaculty`, `approveScheduleChangeCoordinator` from Task 3; `scheduleConfigSchema`, `scheduleChangeRequestSchema`, `scheduleChangeReviewSchema` from Task 2; `requireUserApi`, `requireRole` from `@/lib/auth/session`; `handleApiError` from `@/lib/utils/apiError`.

- [ ] **Step 1: Write the routes**

`src/app/api/students/[studentProfileId]/schedule/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { configureWorkSchedule, requestScheduleChange } from "@/lib/services/attendanceService";
import { scheduleChangeRequestSchema, scheduleConfigSchema } from "@/lib/validators/attendance";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-01: initial schedule config, student self-only.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    const body = scheduleConfigSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await configureWorkSchedule(params.studentProfileId, body, user, ipAddress);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-AT-08: mid-internship schedule-change request, student self-only.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { studentProfileId: string } }
) {
  try {
    const user = await requireUserApi();
    const body = scheduleChangeRequestSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await requestScheduleChange(params.studentProfileId, body, user, ipAddress);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/work-plans/[id]/schedule-change/faculty-review/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { validateScheduleChangeFaculty } from "@/lib/services/attendanceService";
import { scheduleChangeReviewSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-09 step 1: Faculty Adviser only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER]);
    const { action } = scheduleChangeReviewSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await validateScheduleChangeFaculty(params.id, user.id, action, ipAddress);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/work-plans/[id]/schedule-change/coordinator-review/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { approveScheduleChangeCoordinator } from "@/lib/services/attendanceService";
import { scheduleChangeReviewSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-09 step 2: Department Coordinator/Admin only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const { action } = scheduleChangeReviewSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await approveScheduleChangeCoordinator(params.id, user.id, action, ipAddress);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/students/[studentProfileId]/schedule/route.ts" "src/app/api/work-plans/[id]/schedule-change"
git commit -m "Phase 3 Stage D: schedule + schedule-change routes (FR-AT-01, 08, 09)"
```

---

### Task 10: API routes — deviations (2 routes)

**Files:**

- Create: `src/app/api/students/[studentProfileId]/deviations/route.ts`
- Create: `src/app/api/deviations/[id]/validate/route.ts`

**Interfaces:**

- Consumes: `submitDeviationReport`, `listDeviationReportsForStudent`, `validateDeviationReport` from Task 3; `deviationReportSchema`, `deviationValidateSchema` from Task 2; `assertCanAccessStudent` from `@/lib/services/userService`.

- [ ] **Step 1: Write the routes**

`src/app/api/students/[studentProfileId]/deviations/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  listDeviationReportsForStudent,
  submitDeviationReport,
} from "@/lib/services/attendanceService";
import { deviationReportSchema } from "@/lib/validators/attendance";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-03: submit, student self-only.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    const body = deviationReportSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await submitDeviationReport(params.studentProfileId, body, user, ipAddress);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// List, assertCanAccessStudent-gated.
export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const reports = await listDeviationReportsForStudent(params.studentProfileId);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/deviations/[id]/validate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { validateDeviationReport } from "@/lib/services/attendanceService";
import { deviationValidateSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

// FR-AT-04: Faculty/Coordinator/Admin only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, STAFF_ROLES);
    const { action } = deviationValidateSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await validateDeviationReport(params.id, user.id, action, ipAddress);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/students/[studentProfileId]/deviations" "src/app/api/deviations"
git commit -m "Phase 3 Stage D: deviation report routes (FR-AT-03, FR-AT-04)"
```

---

### Task 11: API routes — attendance summary, export, required-hours config (3 routes)

**Files:**

- Create: `src/app/api/students/[studentProfileId]/attendance-summary/route.ts`
- Create: `src/app/api/students/[studentProfileId]/attendance-export/route.ts`
- Create: `src/app/api/config/required-hours/route.ts`

**Interfaces:**

- Consumes: `computeTotalHoursRendered`, `computeProjectedCompletionDate`, `exportAttendanceLogCsv`, `getRequiredHoursConfig`, `setRequiredHoursConfig` from Task 3; `requiredHoursConfigSchema` from Task 2.

- [ ] **Step 1: Write the routes**

`src/app/api/students/[studentProfileId]/attendance-summary/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  computeProjectedCompletionDate,
  computeTotalHoursRendered,
} from "@/lib/services/attendanceService";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const [renderedHours, projectedCompletionDate] = await Promise.all([
      computeTotalHoursRendered(params.studentProfileId),
      computeProjectedCompletionDate(params.studentProfileId),
    ]);
    return NextResponse.json({ renderedHours, projectedCompletionDate });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/students/[studentProfileId]/attendance-export/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { exportAttendanceLogCsv } from "@/lib/services/attendanceService";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const csv = await exportAttendanceLogCsv(params.studentProfileId);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="attendance-${params.studentProfileId}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/config/required-hours/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Program, Role } from "@prisma/client";
import { getRequiredHoursConfig, setRequiredHoursConfig } from "@/lib/services/attendanceService";
import { requiredHoursConfigSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest) {
  try {
    await requireUserApi();
    const url = new URL(req.url);
    const program = url.searchParams.get("program") as Program | null;
    if (!program) {
      return NextResponse.json({ error: "Missing program query param" }, { status: 400 });
    }
    const hours = await getRequiredHoursConfig(program);
    return NextResponse.json({ program, hours });
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-AT-06: Super Admin only.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const { program, hours } = requiredHoursConfigSchema.parse(await req.json());
    const result = await setRequiredHoursConfig(program, hours, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/students/[studentProfileId]/attendance-summary" "src/app/api/students/[studentProfileId]/attendance-export" "src/app/api/config"
git commit -m "Phase 3 Stage D: attendance summary/export + required-hours config routes"
```

---

### Task 12: API routes — weekly reports (5 routes)

**Files:**

- Create: `src/app/api/students/[studentProfileId]/weekly-reports/route.ts`
- Create: `src/app/api/weekly-reports/[id]/route.ts`
- Create: `src/app/api/weekly-reports/[id]/preview/route.ts`
- Create: `src/app/api/weekly-reports/[id]/submit/route.ts`
- Create: `src/app/api/weekly-reports/[id]/review/route.ts`

**Interfaces:**

- Consumes: `generateWeeklyReportForm`, `listWeeklyReportsForStudent`, `getWeeklyReport`, `saveDailyAccomplishment`, `calculateWeeklyTotalHours`, `calculateRunningTotalAndRemaining`, `validateLateSubmissionReason`, `reviewWeeklyReport_Approve/Return/Regard/Disregard`, `generateReportReferenceCode`, `generateReportPdfPreview` from Task 4; `sendReportStatusEmail` from Task 8; `weeklyReportGenerateSchema`, `dailyEntrySchema`, `weeklyReportSubmitSchema`, `weeklyReportReviewSchema` from Task 2.

- [ ] **Step 1: Write the routes**

`src/app/api/students/[studentProfileId]/weekly-reports/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  generateWeeklyReportForm,
  listWeeklyReportsForStudent,
} from "@/lib/services/weeklyReportService";
import { weeklyReportGenerateSchema } from "@/lib/validators/report";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-01: manual "generate this week" fallback, student self-only.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const { weekStart } = weeklyReportGenerateSchema.parse(await req.json());
    const result = await generateWeeklyReportForm(params.studentProfileId, weekStart);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const reports = await listWeeklyReportsForStudent(params.studentProfileId);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/weekly-reports/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  calculateRunningTotalAndRemaining,
  calculateWeeklyTotalHours,
  getWeeklyReport,
  saveDailyAccomplishment,
} from "@/lib/services/weeklyReportService";
import { dailyEntrySchema } from "@/lib/validators/report";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireUserApi();
    const report = await getWeeklyReport(params.id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-WR-03: student self-only daily-entry write. Body must include
// `dailyReportEntryId` alongside the validated hours/accomplishments.
// Recomputes and returns live totals (FR-WR-02) after every save so the
// client form can show an up-to-date running total without a page reload.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    const body = await req.json();
    const { dailyReportEntryId, studentProfileId } = body as {
      dailyReportEntryId: string;
      studentProfileId: string;
    };
    const { hours, accomplishments } = dailyEntrySchema.parse(body);

    const entry = await saveDailyAccomplishment(
      dailyReportEntryId,
      hours,
      accomplishments,
      user.id
    );
    const totalHours = await calculateWeeklyTotalHours(params.id);
    const { runningTotal, remainingHours } = await calculateRunningTotalAndRemaining(
      studentProfileId,
      params.id
    );

    return NextResponse.json({ entry, totalHours, runningTotal, remainingHours });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/weekly-reports/[id]/preview/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { generateReportPdfPreview } from "@/lib/services/weeklyReportService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-09: student self-only preview before final submission.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireUserApi();
    const result = await generateReportPdfPreview(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/weekly-reports/[id]/submit/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { generateReportReferenceCode } from "@/lib/services/weeklyReportService";
import { validateLateSubmissionReason } from "@/lib/services/weeklyReportService";
import { weeklyReportSubmitSchema } from "@/lib/validators/report";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-05 + FR-WR-10: student self-only.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireUserApi();
    const { reasonForDelay } = weeklyReportSubmitSchema.parse(await req.json());
    await validateLateSubmissionReason(params.id, reasonForDelay);
    const result = await generateReportReferenceCode(params.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/weekly-reports/[id]/review/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  reviewWeeklyReport_Approve,
  reviewWeeklyReport_Disregard,
  reviewWeeklyReport_Regard,
  reviewWeeklyReport_Return,
} from "@/lib/services/weeklyReportService";
import { sendReportStatusEmail } from "@/lib/services/notificationService";
import { weeklyReportReviewSchema } from "@/lib/validators/report";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-06: Faculty only, dispatches on `action`.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER]);
    const { action, notes } = weeklyReportReviewSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    let result;
    if (action === "APPROVE") {
      result = await reviewWeeklyReport_Approve(params.id, user.id, ipAddress);
    } else if (action === "RETURN") {
      result = await reviewWeeklyReport_Return(params.id, user.id, notes ?? "", ipAddress);
    } else if (action === "REGARD") {
      result = await reviewWeeklyReport_Regard(params.id, user.id, ipAddress);
    } else {
      result = await reviewWeeklyReport_Disregard(params.id, user.id, ipAddress);
    }

    await sendReportStatusEmail(params.id, action);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/students/[studentProfileId]/weekly-reports" "src/app/api/weekly-reports"
git commit -m "Phase 3 Stage D: weekly report routes (FR-WR-01, 03, 05, 06, 09, 10)"
```

---

### Task 13: API routes — monthly report + calendar (2 routes)

**Files:**

- Create: `src/app/api/students/[studentProfileId]/monthly-reports/route.ts`
- Create: `src/app/api/calendar/route.ts`

**Interfaces:**

- Consumes: `checkMonthlyAggregationEligibility`, `submitMonthlyReport`, `listMonthlyReportsForStudent` from Task 5; `getUnifiedCalendarEvents`, `colorCodeCalendarEvents` from Task 7; `monthlyReportSchema` from Task 2; `ChecklistGateError`-style pattern for a new `MonthlyReportNotEligibleError`.

- [ ] **Step 1: Write the routes**

`src/app/api/students/[studentProfileId]/monthly-reports/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  checkMonthlyAggregationEligibility,
  listMonthlyReportsForStudent,
  submitMonthlyReport,
} from "@/lib/services/monthlyReportService";
import { monthlyReportSchema } from "@/lib/validators/report";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-08: student self-only, gated by checkMonthlyAggregationEligibility.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const { calendarMonth } = monthlyReportSchema.parse(await req.json());

    const eligible = await checkMonthlyAggregationEligibility(
      params.studentProfileId,
      calendarMonth
    );
    if (!eligible) {
      return NextResponse.json(
        { error: "Not all weekly reports for this month are Approved or Regarded yet" },
        { status: 400 }
      );
    }

    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await submitMonthlyReport(
      params.studentProfileId,
      calendarMonth,
      user.id,
      ipAddress
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const reports = await listMonthlyReportsForStudent(params.studentProfileId);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/calendar/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { colorCodeCalendarEvents, getUnifiedCalendarEvents } from "@/lib/services/calendarService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-CAL-01: any authenticated user, role-scoped inside getUnifiedCalendarEvents.
export async function GET() {
  try {
    const user = await requireUserApi();
    const events = await getUnifiedCalendarEvents(user.id, user.role);
    return NextResponse.json({ events: colorCodeCalendarEvents(events) });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/students/[studentProfileId]/monthly-reports" "src/app/api/calendar"
git commit -m "Phase 3 Stage D: monthly report + unified calendar routes (FR-WR-08, FR-CAL-01)"
```

---

### Task 14: UI — Attendance page + F3/F4/F6 stub components

**Files:**

- Create: `src/app/(dashboard)/students/[studentProfileId]/attendance/page.tsx`
- Create: `src/app/(dashboard)/students/[studentProfileId]/attendance/schedule-form.tsx` (F3, stub owner: gu457)
- Create: `src/app/(dashboard)/students/[studentProfileId]/attendance/deviation-form.tsx` (F4, stub owner: gu457)
- Create: `src/app/(dashboard)/students/[studentProfileId]/attendance/export-button.tsx` (F6, stub owner: AndresBonifaci0)

**Interfaces:**

- Consumes: `requireUserPage` from `@/lib/auth/session`; `assertCanAccessStudent`, `ForbiddenError` from `@/lib/services/userService`; `listDeviationReportsForStudent` from `@/lib/services/attendanceService`.

- [ ] **Step 1: Write the stub client components**

`src/app/(dashboard)/students/[studentProfileId]/attendance/schedule-form.tsx`:

```tsx
"use client";

// FR-AT-01, FR-AT-08 — Owner: gu457 (Ulrich)
// Requirement: initial schedule config form, plus a mid-internship
// change-request form (same component, two modes).
// Connects to: POST /api/students/[studentProfileId]/schedule (Task 9
// route) → `attendanceService.configureWorkSchedule` (Task 3) for initial
// setup; PATCH same route → `requestScheduleChange` (Task 3) for a change
// request, body validated by `scheduleChangeRequestSchema`
// (`src/lib/validators/attendance.ts`, Task 2) — needs `reason` (string)
// and `newScheduleConfig` (`{ daysOfWeek: number[], hoursPerDay: number }`),
// plus an optional file upload for the supporting document.
// Follow the Phase 2 `checklist-item-row.tsx` pattern exactly (fetch +
// `sonner` toast + `router.refresh()`) — that file is the reference
// implementation for this kind of client component in this codebase.
// Edge cases: none beyond standard form validation.
export function AttendanceScheduleForm({ studentProfileId }: { studentProfileId: string }) {
  return (
    <div data-testid="attendance-schedule-form" className="text-sm text-muted-foreground">
      Schedule form for {studentProfileId} — not yet implemented (see issue #41).
    </div>
  );
}
```

`src/app/(dashboard)/students/[studentProfileId]/attendance/deviation-form.tsx`:

```tsx
"use client";

// FR-AT-03 — Owner: gu457 (Ulrich)
// Requirement: date, reason category, supporting document upload for an
// absence/undertime/overtime deviation.
// Connects to: POST /api/students/[studentProfileId]/deviations (Task 10
// route) → `attendanceService.submitDeviationReport` (Task 3), body
// validated by `deviationReportSchema` (`src/lib/validators/attendance.ts`,
// Task 2) — needs `date`, `deviationType` (`DeviationType` enum:
// ABSENCE/OVERTIME/UNDERTIME), `reason`, optional `proofUrl`.
// Edge cases: none beyond standard form validation.
export function DeviationReportForm({ studentProfileId }: { studentProfileId: string }) {
  return (
    <div data-testid="deviation-report-form" className="text-sm text-muted-foreground">
      Deviation report form for {studentProfileId} — not yet implemented (see issue #42).
    </div>
  );
}
```

`src/app/(dashboard)/students/[studentProfileId]/attendance/export-button.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

// FR-AT-07 — Owner: AndresBonifaci0 (Matt)
// Requirement: students can export their attendance log as CSV.
// Connects to: GET /api/students/[studentProfileId]/attendance-export
// (Task 11 route) → `attendanceService.exportAttendanceLogCsv` (Task 3).
// The route already sets `Content-Disposition: attachment` — this button
// just needs to trigger the browser download (`window.open` or an anchor
// click, not `fetch` + manual blob handling, unless auth requires it).
// Edge cases: none.
export function AttendanceExportButton({ studentProfileId }: { studentProfileId: string }) {
  void studentProfileId;
  return (
    <Button size="sm" variant="outline" disabled data-testid="attendance-export-button">
      Export CSV (not yet implemented — see issue #44)
    </Button>
  );
}
```

- [ ] **Step 2: Write the page shell**

`src/app/(dashboard)/students/[studentProfileId]/attendance/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { listDeviationReportsForStudent } from "@/lib/services/attendanceService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceScheduleForm } from "./schedule-form";
import { DeviationReportForm } from "./deviation-form";
import { AttendanceExportButton } from "./export-button";

export default async function AttendancePage({ params }: { params: { studentProfileId: string } }) {
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const deviationReports = await listDeviationReportsForStudent(params.studentProfileId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Attendance & Schedule
            <AttendanceExportButton studentProfileId={params.studentProfileId} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceScheduleForm studentProfileId={params.studentProfileId} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deviation Reports ({deviationReports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <DeviationReportForm studentProfileId={params.studentProfileId} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/students/[studentProfileId]/attendance"
git commit -m "Phase 3 Stage E: attendance page shell + F3/F4/F6 stub components"
```

---

### Task 15: UI — Weekly report pages + F1/F7 stub components

**Files:**

- Create: `src/app/(dashboard)/students/[studentProfileId]/weekly-reports/page.tsx`
- Create: `src/app/(dashboard)/students/[studentProfileId]/weekly-reports/weekly-report-form.tsx` (F1, stub owner: gu457)
- Create: `src/app/(dashboard)/students/[studentProfileId]/weekly-reports/copy-paste-warning.ts` (F7, stub owner: AndresBonifaci0)
- Create: `src/app/(dashboard)/students/[studentProfileId]/weekly-reports/[weeklyReportId]/review/page.tsx`
- Create: `src/app/(dashboard)/students/[studentProfileId]/weekly-reports/[weeklyReportId]/review/review-actions.tsx`

**Interfaces:**

- Consumes: `listWeeklyReportsForStudent`, `getWeeklyReport` from Task 4.

- [ ] **Step 1: Write the stub component and pure utility**

`src/app/(dashboard)/students/[studentProfileId]/weekly-reports/weekly-report-form.tsx`:

```tsx
"use client";

// FR-WR-02, FR-WR-03 — Owner: gu457 (Ulrich)
// Requirement: daily accomplishment entry UI — one row per scheduled day
// (hours + accomplishments + tools used), showing live running totals.
// Connects to: PATCH /api/weekly-reports/[id] (Task 12 route) →
// `weeklyReportService.saveDailyAccomplishment` (Task 4), which the route
// already chains with `calculateWeeklyTotalHours`/
// `calculateRunningTotalAndRemaining` and returns in one response — this
// component just needs to read `{ entry, totalHours, runningTotal,
// remainingHours }` from that response and re-render. Before submit, call
// `detectCopyPasteWarning` from `./copy-paste-warning.ts` (F7, same task)
// to block submission on a near-duplicate accomplishment entry.
// Edge cases: none beyond standard form validation.
export function WeeklyReportForm({ weeklyReportId }: { weeklyReportId: string }) {
  return (
    <div data-testid="weekly-report-form" className="text-sm text-muted-foreground">
      Weekly report form for {weeklyReportId} — not yet implemented (see issue #39).
    </div>
  );
}
```

`src/app/(dashboard)/students/[studentProfileId]/weekly-reports/copy-paste-warning.ts`:

```typescript
// FR-WR-04 — Owner: AndresBonifaci0 (Matt)
// Requirement: before submission, compare new accomplishment text against
// the student's immediate prior submission; block submit on an exact or
// near-exact match.
// Connects to: called from `WeeklyReportForm` (F1, `weekly-report-form.tsx`,
// same task) to gate its submit button — pure client-side check, no server
// round-trip (distinct from the server-side vector similarity in FR-AI-01 /
// Module 9, which is out of scope for Phase 3).
// Edge cases: what counts as "near-exact" is this function's actual design
// work (e.g. Levenshtein distance ratio, or a simpler normalized-string
// equality check) — document whichever approach is chosen here.
export function detectCopyPasteWarning(newText: string, priorText: string): boolean {
  void newText;
  void priorText;
  return false;
}
```

- [ ] **Step 2: Write the page shells**

`src/app/(dashboard)/students/[studentProfileId]/weekly-reports/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { listWeeklyReportsForStudent } from "@/lib/services/weeklyReportService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyReportForm } from "./weekly-report-form";

export default async function WeeklyReportsPage({
  params,
}: {
  params: { studentProfileId: string };
}) {
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const reports = await listWeeklyReportsForStudent(params.studentProfileId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Reports ({reports.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reports.map((report) => (
          <WeeklyReportForm key={report.id} weeklyReportId={report.id} />
        ))}
      </CardContent>
    </Card>
  );
}
```

`src/app/(dashboard)/students/[studentProfileId]/weekly-reports/[weeklyReportId]/review/review-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const ACTIONS = ["APPROVE", "RETURN", "REGARD", "DISREGARD"] as const;

export function WeeklyReportReviewActions({ weeklyReportId }: { weeklyReportId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function review(action: (typeof ACTIONS)[number]) {
    setIsPending(true);
    const res = await fetch(`/api/weekly-reports/${weeklyReportId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setIsPending(false);

    if (!res.ok) {
      const body = await res.json();
      toast.error(body.error ?? "Review failed");
      return;
    }
    toast.success(`Report ${action.toLowerCase()}d`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === "APPROVE" || action === "REGARD" ? "default" : "outline"}
          disabled={isPending}
          onClick={() => review(action)}
        >
          {isPending ? "Saving..." : action}
        </Button>
      ))}
    </div>
  );
}
```

`src/app/(dashboard)/students/[studentProfileId]/weekly-reports/[weeklyReportId]/review/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { getWeeklyReport } from "@/lib/services/weeklyReportService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyReportReviewActions } from "./review-actions";

export default async function WeeklyReportReviewPage({
  params,
}: {
  params: { studentProfileId: string; weeklyReportId: string };
}) {
  const user = await requireUserPage();
  if (user.role !== Role.FACULTY_ADVISER) {
    redirect("/");
  }

  const report = await getWeeklyReport(params.weeklyReportId);
  if (!report) {
    redirect(`/students/${params.studentProfileId}/weekly-reports`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Weekly Report — {report!.status}</CardTitle>
      </CardHeader>
      <CardContent>
        <WeeklyReportReviewActions weeklyReportId={params.weeklyReportId} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/students/[studentProfileId]/weekly-reports"
git commit -m "Phase 3 Stage E: weekly report pages + review actions + F1/F7 stub components"
```

---

### Task 16: UI — Monthly report page + F2 stub component

**Files:**

- Create: `src/app/(dashboard)/students/[studentProfileId]/monthly-reports/page.tsx`
- Create: `src/app/(dashboard)/students/[studentProfileId]/monthly-reports/monthly-report-view.tsx` (F2, stub owner: AndresBonifaci0)

**Interfaces:**

- Consumes: `listMonthlyReportsForStudent` from Task 5.

- [ ] **Step 1: Write the stub component**

```tsx
"use client";

// FR-WR-08 — Owner: AndresBonifaci0 (Matt)
// Requirement: eligibility status, a submit action, and a read-only rollup
// of the month's qualifying weekly reports.
// Connects to: eligibility from `checkMonthlyAggregationEligibility`
// (`monthlyReportService.ts`, Task 5) — the route (POST
// /api/students/[studentProfileId]/monthly-reports, Task 13) already
// enforces this gate server-side, but the UI should surface it before the
// user clicks submit, not just after a rejected POST. Submit calls that
// same POST route → `submitMonthlyReport` (Task 5). Rollup data comes from
// GET on the same route → `listMonthlyReportsForStudent` (Task 5), plus
// whatever weekly reports the eligibility check covers (fetch via
// `weeklyReportService.listWeeklyReportsForStudent`, Task 4, filtered
// client-side to the given `calendarMonth`).
// Edge cases: none beyond standard form/gate UX.
export function MonthlyReportView({
  studentProfileId,
  calendarMonth,
}: {
  studentProfileId: string;
  calendarMonth: string;
}) {
  return (
    <div data-testid="monthly-report-view" className="text-sm text-muted-foreground">
      Monthly report for {studentProfileId} / {calendarMonth} — not yet implemented (see issue #40).
    </div>
  );
}
```

- [ ] **Step 2: Write the page shell**

```tsx
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { listMonthlyReportsForStudent } from "@/lib/services/monthlyReportService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyReportView } from "./monthly-report-view";

export default async function MonthlyReportsPage({
  params,
}: {
  params: { studentProfileId: string };
}) {
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const reports = await listMonthlyReportsForStudent(params.studentProfileId);
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Reports ({reports.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <MonthlyReportView
          studentProfileId={params.studentProfileId}
          calendarMonth={currentMonth}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/students/[studentProfileId]/monthly-reports"
git commit -m "Phase 3 Stage E: monthly report page shell + F2 stub component"
```

---

### Task 17: UI — Calendar page + F5 stub component

**Files:**

- Create: `src/app/(dashboard)/calendar/page.tsx`
- Create: `src/app/(dashboard)/calendar/unified-calendar-view.tsx` (F5, stub owner: gu457)

**Interfaces:**

- Consumes: `getUnifiedCalendarEvents`, `colorCodeCalendarEvents`, `CalendarEvent` from Task 7.

- [ ] **Step 1: Write the stub component**

```tsx
"use client";

import type { CalendarEvent } from "@/lib/services/calendarService";

// FR-CAL-01–04 — Owner: gu457 (Ulrich)
// Requirement: the shared color-coded calendar grid, rendered for all four
// roles.
// Connects to: the `events` prop is already fetched and color-coded by the
// server page shell (`calendar/page.tsx`, same task) via
// `calendarService.getUnifiedCalendarEvents` +
// `colorCodeCalendarEvents` (Task 7) — this component is purely
// presentational, it does not fetch. `CalendarEvent.color` (already set:
// red/gray/yellow/green per FR-CAL-01) drives the visual styling;
// `CalendarEvent.type`/`date`/`label` drive placement and content.
// Edge cases: an empty `events` array (new semester, nothing scheduled yet)
// should render an empty grid, not an error state.
export function UnifiedCalendarView({ events }: { events: CalendarEvent[] }) {
  return (
    <div data-testid="unified-calendar-view" className="text-sm text-muted-foreground">
      {events.length} calendar events — grid not yet implemented (see issue #43).
    </div>
  );
}
```

- [ ] **Step 2: Write the page shell**

```tsx
import { requireUserPage } from "@/lib/auth/session";
import { colorCodeCalendarEvents, getUnifiedCalendarEvents } from "@/lib/services/calendarService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedCalendarView } from "./unified-calendar-view";

export default async function CalendarPage() {
  const user = await requireUserPage();
  const events = colorCodeCalendarEvents(await getUnifiedCalendarEvents(user.id, user.role));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar</CardTitle>
      </CardHeader>
      <CardContent>
        <UnifiedCalendarView events={events} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/calendar"
git commit -m "Phase 3 Stage E: unified calendar page shell + F5 stub component"
```

---

### Task 18: Nav entries

**Files:**

- Modify: `src/app/(dashboard)/dashboard-nav.tsx`

**Interfaces:** none new — pure link additions.

- [ ] **Step 1: Read the current nav structure**

Run: `grep -n "href:" "src/app/(dashboard)/dashboard-nav.tsx"` to see the existing link-array shape before adding to it, and match its exact object structure (label/href/roles fields).

- [ ] **Step 2: Add the three new links**

Add entries for `{ label: "Attendance", href: (studentProfileId) => ... }`-style or the flat-path equivalent already used by "Companies"/"My Students" — add:

- "Weekly Reports" → `/weekly-reports` (thin redirect page resolving the current user's own `studentProfileId`, matching the existing `(dashboard)/checklist/page.tsx` redirect-page convention — create `src/app/(dashboard)/weekly-reports/page.tsx` that resolves `getCurrentUser()`'s own profile and redirects to `/students/[id]/weekly-reports`, same shape as the existing checklist redirect page).
- "Attendance" → same redirect-page pattern, `src/app/(dashboard)/attendance/page.tsx`.
- "Calendar" → `/calendar` directly (already role-agnostic, no redirect page needed), visible to all roles.

Follow whatever conditional-visibility mechanism the existing "My Students" entry already uses (role array check) so "Attendance"/"Weekly Reports" show for all roles and "Calendar" shows for all roles.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/dashboard-nav.tsx" "src/app/(dashboard)/weekly-reports" "src/app/(dashboard)/attendance"
git commit -m "Phase 3 Stage E: nav entries for Attendance, Weekly Reports, Calendar"
```

---

### Task 19: Jest coverage thresholds + docs reconciliation

**Files:**

- Modify: `jest.config.ts`
- Modify: `CONTRIBUTING.md`

**Interfaces:** none.

- [ ] **Step 1: Add coverage thresholds**

In `jest.config.ts`'s `coverageThreshold` object, add entries scoped to the framework surface (RBAC/validation/wiring branches actually exercised by this plan's tests — not stub-body logic, which is TODO by design):

```typescript
"src/lib/services/attendanceService.ts": { statements: 40, branches: 30, functions: 40, lines: 40 },
"src/lib/services/weeklyReportService.ts": { statements: 40, branches: 30, functions: 40, lines: 40 },
"src/lib/services/monthlyReportService.ts": { statements: 50, branches: 30, functions: 50, lines: 50 },
"src/lib/services/calendarService.ts": { statements: 40, branches: 30, functions: 40, lines: 40 },
```

(Thresholds are deliberately lower than Phase 1/2's 90/90/90/90 — those covered real business logic; this phase's service files are mostly TODO stub bodies by design, and the smoke tests already exercise every exported function once.)

- [ ] **Step 2: Run full coverage to confirm thresholds pass**

Run: `npx jest --coverage`
Expected: PASS, all new thresholds met.

- [ ] **Step 3: Add a CONTRIBUTING.md note on the stub convention**

Append a short section explaining: `// TODO(<github-username>): <contract>` marks a Phase 3 stub tracked in `PHASE3_TASKS.md` and its matching GitHub issue; implementers should replace the body only, keep the signature and JSDoc contract intact (routes/tests/other stubs already depend on the exact signature), and remove the smoke-test's placeholder assertion in the matching `*.test.ts` file, replacing it with a real test for their logic.

- [ ] **Step 4: Commit**

```bash
git add jest.config.ts CONTRIBUTING.md
git commit -m "Phase 3 Stage F/G: coverage thresholds for Phase 3 service files + stub-convention docs"
```

---

## Final Verification (run once all tasks are complete)

- [ ] `npm run lint && npx tsc --noEmit && npx prisma validate && npm run build` all green.
- [ ] `npx jest --coverage` green, all thresholds (Phase 1/2's existing ones plus this plan's Task 19 additions) pass.
- [ ] Live-test against the shared Supabase dev DB: confirm `db push` applied the `scheduleId` drop and `periodLabel` add without data loss on existing rows.
- [ ] Browser-walkthrough each of the 15 new routes once per role that can reach it, confirming a 401/403 for the wrong role and a 2xx (with the documented placeholder payload) for the right one — this is Phase 1/2's established RBAC-verification method; no new automated route tests are introduced by this plan.
- [ ] Confirm all 43 GitHub issues in `team-beacon-slu/idsms-cis` (#3–#45) still point at file paths and function names that match what actually landed in this PR — fix any drift between the plan's placeholder and what got committed.
- [ ] Open a PR for `feature/phase3-attendance-reports-calendar` into `develop`, referencing `PHASE3_TASKS.md` and the design spec in the description.
