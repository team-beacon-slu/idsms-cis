# Workstream L2 — Conduct records, deduction matrix & tally: Implementation Plan

**Spec:** `docs/superpowers/specs/2026-10-12-phase4-leave-time-requests-design.md`, sections "Demerits", "Deduction matrix: grade points" and answers 8–12 (approved by Jay 2026-10-12). Builds on L1 (PR #87, credited hours).

**Goal:** staff record warnings, demerits, violations and suspensions; IDSMS counts late/missing weekly reports and unsupported UT/absences automatically; an editable deduction matrix turns the counts into ADVISER and WWR grade-point deductions; staff can excuse automatic items; optional hours on a conduct record reduce rendered hours.

## Summary

| Metric         | Value                                                   |
| -------------- | ------------------------------------------------------- |
| Tasks          | 5                                                       |
| Complexity     | Medium                                                  |
| Migration      | `009_conduct_deductions.sql` (additive; H moves to 010) |
| Key dependency | L1 credited hours (`calculateRenderedHours`)            |

## Global constraints

- No uploads (D2/D7). Documentation for excuses lives in Google Classroom.
- Never delete: conduct records are revoked, excuses withdrawn — each with a reason, audited (`CONDUCT_RECORD_ISSUED`, `CONDUCT_RECORD_REVOKED`, `DEDUCTION_EXCUSED`, `DEDUCTION_EXCUSE_WITHDRAWN`), in the same transaction as the write.
- Issuing / revoking / excusing: assigned faculty adviser (own students, `assertCanAccessStudent`), coordinator, Super Admin. Editing the matrix and the default hours: Super Admin only.
- IDSMS reports deductions; it does not compute a final grade.
- Counts run across the whole internship (answer 9). Late submission does not remove a deduction.
- `hoursDeducted` default 0 (answer 12), per-case override 0–40.
- Status-guarded writes (as in L1) for revoke/withdraw so two staff can't double-act.

## Execution order

| #   | Task                                                 | Depends on |
| --- | ---------------------------------------------------- | ---------- |
| 1   | Deduction matrix config + pure tally                 | —          |
| 2   | Migration 009 + conduct records service/API          | 1          |
| 3   | Automatic items + excuses                            | 1, 2       |
| 4   | Tally per student + hours subtraction                | 1–3        |
| 5   | UI: student conduct card, settings, dashboard column | 1–4        |

---

### Task 1: Deduction matrix config and the tally maths

**Files:** create `src/lib/utils/deductionMatrix.ts` (+test), `src/lib/validators/deductionMatrix.ts`; modify `attendanceService.ts` (get/set via `SystemConfig` keys `deduction_matrix`, `conduct:default_hours`, same pattern as `getFinalReportThreshold`).

```ts
type Points = { adviser: number; wwr: number };
interface MatrixCategory {
  key: string; // "WRITTEN_WARNING", "DEMERIT", "LATE_WWR", "UNSUPPORTED_UT", "MAJOR_VIOLATION", "SUSPENSION", or admin-added
  label: string;
  mode: "TOTAL_AT_COUNT" | "PER_INCIDENT";
  source: "MANUAL" | "AUTOMATIC";
  tiers: Array<{ count: number } & Points>; // ascending counts; may be empty (suspension until filled)
  extraIfNoValidReason?: Points;
}
export const DEFAULT_MATRIX: MatrixCategory[]; // the slide values from the spec
export function categoryDeduction(
  cat: MatrixCategory,
  count: number,
  noValidReasonCount: number
): Points;
```

Rules: count 0 → 0. `TOTAL_AT_COUNT`: tier value at `count` (above the last tier → last tier). `PER_INCIDENT`: sum of tiers 1..count (above the last tier, each extra incident adds the last tier). Plus `extraIfNoValidReason × noValidReasonCount`. Deductions are reported as positive numbers ("−5" in the UI).

**Tests:** every slide example (3 demerits = 5/5 total; 4 demerits = 6/7; late WWR 2 = 4/6 + 2 extra per unjustified), above-last-tier, PER_INCIDENT sum, empty tiers → 0, validator rejects non-ascending counts / negative points / duplicate keys.

### Task 2: Migration 009 and conduct records

**Files:** `prisma/schema.prisma`, `prisma/migrations_manual/009_conduct_deductions.sql`; create `src/lib/services/conductService.ts` (+test), `src/lib/validators/conduct.ts`, routes `api/students/[id]/conduct-records` (GET, POST) and `api/conduct-records/[id]/revoke` (POST); `notify.ts` trigger `CONDUCT_RECORD_ISSUED`.

`ConductRecord`: id, studentProfileId, categoryKey, weight (1|2; a "First and Final" warning counts 2), date, reason (10–500), hoursDeducted Decimal(4,2) default 0, issuedById, createdAt, revokedAt?, revokedById?, revokeReason?.
`DeductionException`: id, studentProfileId, itemType (`LATE_WWR` | `MISSING_WWR` | `UNSUPPORTED_UT`), itemKey (weeklyReportId or `YYYY-MM-DD`), reasonCode (`HTE_ATTESTED_DOCUMENTATION` | `BEYOND_INTERN_CONTROL`), note (10–500), createdById, createdAt, withdrawnAt?, withdrawnById?. Partial unique index: one active exception per (studentProfileId, itemType, itemKey).

**Tests:** issue (role/assignment, manual categories only, audited, notified after commit, default hours applied when omitted), revoke (reason required, guarded: second revoke → 409).

### Task 3: Automatic items and excuses

**Files:** create `src/lib/services/deductionService.ts` (+test); routes `api/students/[id]/deductions` (GET), `api/students/[id]/deductions/excuse` (POST), `api/deduction-exceptions/[id]/withdraw` (POST).

`listAutomaticItems(studentProfileId, now)`:

- `LATE_WWR`: weekly reports whose latest SUBMITTED entry is `late` (unjustified = no reasonForDelay).
- `MISSING_WWR`: weeks from the student's first report through the last week whose deadline has passed, with no report or a report never submitted (always unjustified).
- `UNSUPPORTED_UT`: PRESENT scheduled days with a late/early gap (`dayGaps`) and no UNDERTIME request, or partial leave covering it, that is APPROVED; and ABSENT scheduled days with no APPROVED ABSENCE covering the date (always unjustified).
  Each item: `{ itemType, itemKey, date, detail, unjustified, excused?: {id, reasonCode, note} }`.

**Tests:** each item type found and not found, an approved request removes UT, a pending one does not; excuse/withdraw (guarded, reason codes, audited).

### Task 4: Tally and hours

**Files:** `deductionService.ts` `getDeductionTally(studentProfileId)`; `attendanceService.calculateRenderedHours` subtracts active conduct hours (floored at 0).

Tally: for each matrix category, count = Σ weight of active conduct records (manual) or non-excused automatic items (automatic); `noValidReasonCount` = unjustified non-excused automatic items. Totals = Σ adviser, Σ wwr.

**Tests:** manual + automatic combine, revoked and excused excluded, weight 2 counts twice, rendered hours minus conduct hours (and floor at 0), existing hours tests unchanged when there are no records.

### Task 5: UI

- Student attendance page: "Conduct & deductions" card — tally (category, count, ADVISER, WWR, totals), conduct records list (revoked shown struck through with reason), automatic items with Excused badges. Staff get Issue (category, weight, date, reason, hours), Revoke (inline reason), Excuse/Withdraw (inline reason code + note). No `window.confirm`; accessible names include the date/category.
- Settings: Super Admin edits the matrix (validated JSON editor with the defaults pre-filled and a "Reset to SLU defaults" button) and the default hours per conduct record, on the Users settings area next to required hours.
- Faculty dashboard / compliance table: per-student "Deductions (ADVISER / WWR)" column.

**Gate (every task):** `npx tsc --noEmit && npx next lint && npx jest`; final task adds `npx next build`.

## Acceptance

- 009 applied with Jay's OK; hands-on: issue a demerit (tally moves, intern notified), revoke it, excuse a late WWR, edit a tier in settings and see the tally change.
