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
- Stub function bodies are `// TODO(<github-username>): <FR-ID> — <contract from PHASE3_TASKS.md>` followed by a placeholder return of the correct type. They must compile and must NOT throw — callers (routes, tests) rely on a resolvable placeholder.
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

// FR-AT-01. Owner: KennethRusselAvaricio.
export async function configureWorkSchedule(
  studentProfileId: string,
  input: ConfigureWorkScheduleInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ studentProfileId: string; scheduleConfig: ConfigureWorkScheduleInput }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(KennethRusselAvaricio): FR-AT-01 — persist `input` into this
  // student's latest WorkPlan.scheduleConfig, only once WorkPlan.status is
  // APPROVED; log via logEvent("SCHEDULE_CONFIGURED") inside a $transaction.
  void ipAddress;
  return { studentProfileId, scheduleConfig: input };
}

export interface HolidayCalendarEntryDTO {
  id: string;
  date: Date;
  name: string;
  applicable: boolean;
}

// FR-AT-02. Owner: 2215428-sys (Gillian).
export async function getHolidayCalendarForStudent(
  studentProfileId: string
): Promise<HolidayCalendarEntryDTO[]> {
  // TODO(2215428-sys): FR-AT-02 — merge HolidayCalendarEntry rows (national/
  // regional/semester-scoped) with the student's company non-working days
  // and any per-student override from markHolidayApplicable.
  void studentProfileId;
  return [];
}

// FR-AT-02. Owner: 2215428-sys (Gillian).
export async function markHolidayApplicable(
  studentProfileId: string,
  holidayEntryId: string,
  applicable: boolean,
  actingUser: { id: string; role: Role }
): Promise<{ holidayEntryId: string; applicable: boolean }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(2215428-sys): FR-AT-02 — persist the per-student holiday override.
  return { holidayEntryId, applicable };
}

export interface SubmitDeviationReportInput {
  date: Date;
  deviationType: DeviationType;
  reason: string;
  proofUrl?: string;
}

// FR-AT-03. Owner: KennethRusselAvaricio.
export async function submitDeviationReport(
  studentProfileId: string,
  input: SubmitDeviationReportInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ id: string; validationStatus: ValidationStatus }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(KennethRusselAvaricio): FR-AT-03 — create a DeviationReport row
  // (validationStatus: PENDING) inside a $transaction with
  // logEvent("DEVIATION_SUBMITTED"). `input.proofUrl` is set by the route
  // after an uploadFile call (Phase 2 storage.ts pattern) when a file is attached.
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

// FR-AT-04. Owner: KennethRusselAvaricio.
export async function validateDeviationReport(
  deviationReportId: string,
  facultyId: string,
  action: "VALIDATE" | "REJECT",
  ipAddress?: string | null
): Promise<{ id: string; validationStatus: ValidationStatus }> {
  // TODO(KennethRusselAvaricio): FR-AT-04 — set DeviationReport.validationStatus
  // to VALIDATED or REJECTED plus DeviationReport.facultyId = facultyId. A
  // REJECTED row must never be readable by computeTotalHoursRendered.
  void facultyId;
  void action;
  void ipAddress;
  return { id: deviationReportId, validationStatus: ValidationStatus.PENDING };
}

// FR-AT-05. Owner: JayPing23 (Danielle).
export async function computeTotalHoursRendered(studentProfileId: string): Promise<number> {
  // TODO(JayPing23): FR-AT-05 — sum DailyReportEntry.actualHours across every
  // WeeklyReport with status APPROVED or REGARDED for this student, plus
  // VALIDATED OVERTIME deviations, minus VALIDATED ABSENCE/UNDERTIME
  // deviations. Never read PENDING/RETURNED/DISREGARDED rows. Write the
  // result to StudentProfile.renderedHours.
  void studentProfileId;
  return 0;
}

// FR-AT-05. Owner: JayPing23 (Danielle).
export async function computeProjectedCompletionDate(
  studentProfileId: string
): Promise<Date | null> {
  // TODO(JayPing23): FR-AT-05 — using computeTotalHoursRendered,
  // StudentProfile.requiredHours, and the active schedule from
  // WorkPlan.scheduleConfig (post any applyScheduleChangeProspectively
  // change), project a completion date. Return null with no approved schedule.
  void studentProfileId;
  return null;
}

const REQUIRED_HOURS_CONFIG_KEY = (program: Program) => `required_hours:${program}`;

// FR-AT-06. Owner: 2215428-sys (Gillian).
export async function getRequiredHoursConfig(program: Program): Promise<number> {
  // TODO(2215428-sys): FR-AT-06 — read SystemConfig where configKey ===
  // REQUIRED_HOURS_CONFIG_KEY(program); fall back to a documented default if unset.
  void program;
  return 0;
}

// FR-AT-06. Owner: 2215428-sys (Gillian).
export async function setRequiredHoursConfig(
  program: Program,
  hours: number,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ program: Program; hours: number }> {
  // TODO(2215428-sys): FR-AT-06 — upsert SystemConfig at
  // REQUIRED_HOURS_CONFIG_KEY(program), Super Admin only (route-enforced).
  // Must NOT retroactively alter already-provisioned StudentProfile.requiredHours.
  void actingUserId;
  void ipAddress;
  return { program, hours };
}

// FR-AT-07. Owner: Shantea23.
export async function exportAttendanceLogCsv(studentProfileId: string): Promise<string> {
  // TODO(Shantea23): FR-AT-07 — assemble a CSV (date, scheduled hours,
  // actual hours, status) from this student's DailyReportEntry rows.
  void studentProfileId;
  return "date,scheduledHours,actualHours,status\n";
}

export interface RequestScheduleChangeInput {
  reason: string;
  newScheduleConfig: ConfigureWorkScheduleInput;
  supportingDocumentPath?: string;
}

// FR-AT-08. Owner: Rhaastas (org invite pending).
export async function requestScheduleChange(
  studentProfileId: string,
  input: RequestScheduleChangeInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: "PENDING_FACULTY" }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(Rhaastas): FR-AT-08 — append a pending schedule-change request to
  // this student's latest WorkPlan.scheduleChangeHistory (status
  // PENDING_FACULTY) via logScheduleChangeHistory.
  void input;
  void ipAddress;
  return { workPlanId: "", status: "PENDING_FACULTY" };
}

// FR-AT-09 (step 1 of 2). Owner: JayPing23 (Danielle).
export async function validateScheduleChangeFaculty(
  workPlanId: string,
  facultyId: string,
  action: "APPROVE" | "REJECT",
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: string }> {
  // TODO(JayPing23): FR-AT-09 (step 1) — Faculty APPROVE advances the
  // pending request to PENDING_COORDINATOR for approveScheduleChangeCoordinator;
  // REJECT is terminal. Log via logScheduleChangeHistory.
  void facultyId;
  void action;
  void ipAddress;
  return { workPlanId, status: "PENDING_FACULTY" };
}

// FR-AT-09 (step 2 of 2). Owner: JayPing23 (Danielle).
export async function approveScheduleChangeCoordinator(
  workPlanId: string,
  coordinatorId: string,
  action: "APPROVE" | "REJECT",
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: string }> {
  // TODO(JayPing23): FR-AT-09 (step 2) — only callable once step 1's status
  // is PENDING_COORDINATOR. On final APPROVE, trigger
  // applyScheduleChangeProspectively. Log via logScheduleChangeHistory.
  void coordinatorId;
  void action;
  void ipAddress;
  return { workPlanId, status: "PENDING_COORDINATOR" };
}

// FR-AT-10. Owner: JayPing23 (Danielle).
export async function applyScheduleChangeProspectively(
  workPlanId: string
): Promise<{ workPlanId: string; effectiveFrom: Date }> {
  // TODO(JayPing23): FR-AT-10 — swap the active scheduleConfig for
  // future-dated computation only; must not touch any already-computed
  // WeeklyReport/DailyReportEntry row. Trigger
  // computeProjectedCompletionDate to recompute after applying.
  return { workPlanId, effectiveFrom: new Date() };
}

export interface ScheduleChangeHistoryEntry {
  timestamp: string;
  approverId: string | null;
  action: string;
  [key: string]: unknown;
}

// FR-AT-11. Owner: KennethRusselAvaricio.
export async function logScheduleChangeHistory(
  workPlanId: string,
  entry: ScheduleChangeHistoryEntry,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<void> {
  // TODO(KennethRusselAvaricio): FR-AT-11 — append `entry` to this
  // WorkPlan's scheduleChangeHistory JSONB array. Called internally by
  // requestScheduleChange/validateScheduleChangeFaculty/
  // approveScheduleChangeCoordinator/applyScheduleChangeProspectively —
  // not exposed as its own route.
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

// FR-WR-01. Owner: Shantea23.
export async function generateWeeklyReportForm(
  studentProfileId: string,
  weekStart: Date
): Promise<{ weeklyReportId: string; weekStart: Date; weekEnd: Date }> {
  // TODO(Shantea23): FR-WR-01 — create a WeeklyReport row plus one
  // DailyReportEntry per scheduled working day that week (scheduledHours
  // pre-filled from WorkPlan.scheduleConfig, actualHours null), skipping
  // days attendanceService.getHolidayCalendarForStudent marks non-working.
  void studentProfileId;
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { weeklyReportId: "", weekStart, weekEnd };
}

// FR-WR-02. Owner: KennethRusselAvaricio.
export async function calculateWeeklyTotalHours(weeklyReportId: string): Promise<number> {
  // TODO(KennethRusselAvaricio): FR-WR-02 — sum DailyReportEntry.actualHours
  // for this report and write WeeklyReport.totalHours.
  void weeklyReportId;
  return 0;
}

// FR-WR-02. Owner: KennethRusselAvaricio.
export async function calculateRunningTotalAndRemaining(
  studentProfileId: string,
  weeklyReportId: string
): Promise<{ runningTotal: number; remainingHours: number }> {
  // TODO(KennethRusselAvaricio): FR-WR-02 — write WeeklyReport.runningTotal
  // (cumulative across prior APPROVED/REGARDED weeks + this one) and
  // WeeklyReport.remainingHours (against StudentProfile.requiredHours).
  void studentProfileId;
  void weeklyReportId;
  return { runningTotal: 0, remainingHours: 0 };
}

// FR-WR-03. Owner: gu457 (Ulrich).
export async function saveDailyAccomplishment(
  dailyReportEntryId: string,
  hours: number,
  accomplishments: string,
  studentUserId: string
): Promise<{ id: string; hours: number; accomplishments: string }> {
  // TODO(gu457): FR-WR-03 — write to this DailyReportEntry only; enforce
  // the caller is the owning student (self-only) and the parent
  // WeeklyReport is not already APPROVED/REGARDED/DISREGARDED.
  void studentUserId;
  return { id: dailyReportEntryId, hours, accomplishments };
}

// FR-WR-05. Owner: Shantea23.
export async function validateLateSubmissionReason(
  weeklyReportId: string,
  reasonForDelay?: string
): Promise<void> {
  // TODO(Shantea23): FR-WR-05 — reports are due Tuesday; if this report's
  // weekEnd + due offset has passed, throw unless reasonForDelay is
  // non-empty. Store it so faculty can view it during review. No-op if not late.
  void weeklyReportId;
  void reasonForDelay;
  return;
}

// FR-WR-06 (Approve). Owner: JayPing23 (Danielle).
export async function reviewWeeklyReport_Approve(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(JayPing23): FR-WR-06 (Approve) — set status APPROVED,
  // facultyAction. Must trigger attendanceService's computeTotalHoursRendered
  // + computeProjectedCompletionDate since this report's hours now count.
  void facultyId;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-06 (Return). Owner: KennethRusselAvaricio.
export async function reviewWeeklyReport_Return(
  weeklyReportId: string,
  facultyId: string,
  notes: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(KennethRusselAvaricio): FR-WR-06 (Return) — set status RETURNED,
  // append `notes` to revisionHistory Json; hours do not count.
  void facultyId;
  void notes;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-06 (Regard). Owner: KennethRusselAvaricio.
export async function reviewWeeklyReport_Regard(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(KennethRusselAvaricio): FR-WR-06 (Regard) — set status REGARDED;
  // hours count (same trigger as Approve), status stays visually distinct.
  void facultyId;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-06 (Disregard). Owner: JayPing23 (Danielle).
export async function reviewWeeklyReport_Disregard(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  // TODO(JayPing23): FR-WR-06 (Disregard) — set status DISREGARDED, hours
  // excluded from computeTotalHoursRendered; must clear/reset so
  // generateWeeklyReportForm can regenerate a fresh form for that week
  // without violating the [studentProfileId, weekStart] unique constraint.
  void facultyId;
  void ipAddress;
  return { id: weeklyReportId, status: WeeklyReportStatus.PENDING };
}

// FR-WR-09. Owner: gu457 (Ulrich).
export async function generateReportPdfPreview(
  weeklyReportId: string
): Promise<{ previewUrl: string | null }> {
  // TODO(gu457): FR-WR-09 — render a preview (not the final Puppeteer PDF
  // from Module 8) the student can review before submitting.
  void weeklyReportId;
  return { previewUrl: null };
}

// FR-WR-10. Owner: Shantea23.
export async function generateReportReferenceCode(
  weeklyReportId: string
): Promise<{ referenceCode: string; timestamp: Date }> {
  // TODO(Shantea23): FR-WR-10 — produce a unique, human-readable reference
  // code (e.g. "WR-2026-000123") + timestamp for the submitted report.
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

// FR-WR-08. Owner: JayPing23 (Danielle).
export async function checkMonthlyAggregationEligibility(
  studentProfileId: string,
  calendarMonth: string // "YYYY-MM"
): Promise<boolean> {
  // TODO(JayPing23): FR-WR-08 — true only if every WeeklyReport whose
  // [weekStart, weekEnd] overlaps calendarMonth is APPROVED or REGARDED.
  void studentProfileId;
  void calendarMonth;
  return false;
}

// FR-WR-08. Owner: JayPing23 (Danielle).
export async function submitMonthlyReport(
  studentProfileId: string,
  calendarMonth: string,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ generatedDocumentId: string; calendarMonth: string }> {
  // TODO(JayPing23): FR-WR-08 — after checkMonthlyAggregationEligibility
  // passes, create GeneratedDocument(documentType: MONTHLY_REPORT, status:
  // PENDING_DRAFT, periodLabel: calendarMonth) inside a $transaction with
  // logEvent. Idempotent — no duplicate submission for the same student+month.
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

// FR-CAL-01. Owner: JayPing23 (Danielle).
export async function getUnifiedCalendarEvents(
  userId: string,
  role: Role
): Promise<CalendarEvent[]> {
  // TODO(JayPing23): FR-CAL-01 — aggregator. Pulls weekly report deadlines,
  // HolidayCalendarEntry rows, VALIDATED DeviationReport rows, and
  // attendanceService.computeProjectedCompletionDate into one normalized
  // array, scoped by role (student: own; faculty: assigned students via
  // faculty_class_groups; coordinator: department).
  void userId;
  void role;
  return [];
}

// FR-CAL-01. Owner: AndresBonifaci0 (Matt).
export function colorCodeCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  // TODO(AndresBonifaci0): FR-CAL-01 — pure formatting helper. Maps
  // event.type to a display color: DEADLINE=red, HOLIDAY=gray,
  // DEVIATION=yellow, COMPLETION=green.
  return events;
}

// FR-CAL-02. Owner: gu457 (Ulrich).
export async function getStudentCalendarView(studentProfileId: string): Promise<CalendarEvent[]> {
  // TODO(gu457): FR-CAL-02 — calls getUnifiedCalendarEvents scoped to one
  // student, layers in their specific schedule for the calendar UI.
  void studentProfileId;
  return [];
}

// FR-CAL-03. Owner: AndresBonifaci0 (Matt).
export async function getFacultyCalendarView(facultyId: string): Promise<CalendarEvent[]> {
  // TODO(AndresBonifaci0): FR-CAL-03 — calls getUnifiedCalendarEvents per
  // assigned student (via faculty_class_groups) and merges into one
  // aggregated view.
  void facultyId;
  return [];
}

// FR-CAL-03. Owner: AndresBonifaci0 (Matt).
export async function detectHighVolumeSubmissionWeeks(
  facultyId: string
): Promise<{ weekStart: Date; count: number }[]> {
  // TODO(AndresBonifaci0): FR-CAL-03 — bucket getFacultyCalendarView's
  // deadlines by week, flag weeks exceeding a configurable threshold.
  void facultyId;
  return [];
}

// FR-CAL-04. Owner: AndresBonifaci0 (Matt).
export async function getCoordinatorCalendarView(coordinatorId: string): Promise<CalendarEvent[]> {
  // TODO(AndresBonifaci0): FR-CAL-04 — merges getUnifiedCalendarEvents-style
  // events department-wide with MOA expiry dates (reuse
  // companyService.getExpiringMoaRecords).
  void coordinatorId;
  return [];
}

// FR-CAL-04. Owner: JayPing23 (Danielle).
export async function detectEndorsementLetterSpikes(
  coordinatorId: string
): Promise<{ weekStart: Date; expectedCount: number }[]> {
  // TODO(JayPing23): FR-CAL-04 — clusters students' projected completion
  // dates (attendanceService.computeProjectedCompletionDate) by week/month
  // to flag upcoming endorsement-letter generation load spikes.
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

// FR-WR-07. Owner: Rhaastas (org invite pending — issue #27 created
// unassigned; assign once they accept).
export async function sendReportStatusEmail(
  weeklyReportId: string,
  action: "APPROVE" | "RETURN" | "REGARD" | "DISREGARD"
): Promise<{ sent: boolean }> {
  // TODO(Rhaastas): FR-WR-07 — send a Resend/React-Email notification to
  // the student (and faculty on submission) per FR-NT-04's convention
  // (Module 11).
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

// TODO(gu457): FR-AT-01, FR-AT-08 — initial schedule config (POST
// /api/students/[studentProfileId]/schedule, wired to configureWorkSchedule)
// and mid-internship change request (PATCH same route, wired to
// requestScheduleChange), including a reason field and optional supporting-
// document upload. Follow the Phase 2 checklist-item-row.tsx pattern (fetch
// + sonner toast + router.refresh()).
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

// TODO(gu457): FR-AT-03 — date, reason category, supporting document
// upload, wired to POST /api/students/[studentProfileId]/deviations
// (submitDeviationReport).
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

// TODO(AndresBonifaci0): FR-AT-07 — trigger a CSV download from GET
// /api/students/[studentProfileId]/attendance-export (exportAttendanceLogCsv).
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

// TODO(gu457): FR-WR-02, FR-WR-03 — daily accomplishment entry UI, one row
// per scheduled day (hours + accomplishments + tools used), wired to PATCH
// /api/weekly-reports/[id] (saveDailyAccomplishment) with live totals from
// calculateWeeklyTotalHours/calculateRunningTotalAndRemaining, gated by
// detectCopyPasteWarning (copy-paste-warning.ts) before submit.
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
// TODO(AndresBonifaci0): FR-WR-04 — pure client-side string-similarity
// check (no server round-trip) comparing new accomplishment text against
// the student's immediate prior submission. Distinct from the server-side
// vector similarity in FR-AI-01. Wires into WeeklyReportForm to gate its
// submit button.
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

// TODO(AndresBonifaci0): FR-WR-08 — eligibility status from GET
// /api/students/[studentProfileId]/monthly-reports?calendarMonth=..., a
// submit action wired to POST (submitMonthlyReport), and a read-only
// rollup of the qualifying weekly reports for the given calendar month.
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

// TODO(gu457): FR-CAL-01–04 — shared color-coded calendar grid, rendered
// for all four roles, rendering whatever the server passes in via
// getUnifiedCalendarEvents (already color-coded by colorCodeCalendarEvents).
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
