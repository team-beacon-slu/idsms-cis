# Report-Flow Gaps Implementation Plan (Phase 4 · Workstream B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the adviser's weekly-report gaps:

- Students and faculty see **confirmed vs. pending ("temporary") hours**.
- Each day has an explicit **attendance status** (Present/Absent/Holiday) and optional **time in/out**.
- Students can **upload the manager-signed copy** of a submitted report.
- The one schema migration all of Phase 4 needs lands here, first.

**Architecture:**

- **Schema:** one additive, all-nullable migration (Task 1) adds the columns Phase 4 needs: `daily_report_entries.time_in/time_out`, `notifications.read_at`, `student_profiles.full_name`, `companies.supervisor_position`.
- **Hours:** a pure `getHoursSummary()` sits beside `calculateRenderedHours()`, which stays the single "confirmed" source.
- **Signed copies:** recorded as a lifecycle-neutral `SIGNED_COPY_UPLOADED` entry in `revisionHistory`. `isAwaitingReview` is taught to skip non-lifecycle entries.

**Tech Stack:** Next.js 14 · Prisma 6 · Supabase Storage (existing `checklist-documents` bucket) · zod 4 · Jest.

**Spec:** `docs/superpowers/plans/2026-10-11-phase4-roadmap.md` (Workstream B, decisions D1/D2/D3 at their **defaults**); PRD FR-WR-02/03/05/06, FR-AT-05.

## Decisions applied (defaults, per the user's instruction 2026-10-11)

- **D1, approval authority:** the faculty adviser's Approve/Regard makes hours "true" (PRD FR-WR-06, current build). No second confirmation step.
- **D2, signed copy:** optional upload into IDSMS after submission. It is **not** a gate for monthly reports, and Google Classroom stays allowed.
- **D3, template:** keep the current layout. Monthly narrative fields are **out of scope** until SLU's template arrives. They'd need a new content column with a design we can't verify without the template.

## Global Constraints

- Migrations are additive and nullable only. Existing rows must stay valid with no backfill.
- "Confirmed hours" always come from `calculateRenderedHours()` (APPROVED/REGARDED only). Nothing else may count PENDING or RETURNED hours as rendered (FR-AT-05).
- Attendance status values: `PRESENT`, `ABSENT`, `HOLIDAY`, plus the existing generated value `SCHEDULED` for unfilled days. ABSENT/HOLIDAY ⇒ `actualHours = 0`.
- Times are `"HH:MM"` 24-hour Manila wall-clock strings; `timeOut > timeIn`; `hours ≤ (timeOut − timeIn)`.
- Uploads go through `validateUpload()` (PDF ≤ 5 MB, JPG/PNG ≤ 2 MB).
- No Claude/Anthropic attribution in commits.

## Review Focus

1. **A signed copy uploaded while a report awaits review must not unlock editing.** `isAwaitingReview` must ignore `SIGNED_COPY_UPLOADED`. → Task 4 test `stays locked after a signed copy is attached`.
2. **Marking a day ABSENT with leftover hours or text.** The server forces hours to 0 and doesn't require accomplishments. → Task 3 test `ABSENT forces 0 hours…`.
3. **Time out before time in (night typo), or hours larger than the time window.** Must be rejected with 400, not saved. → Task 3 validator tests.
4. **A report with every day ABSENT or HOLIDAY** must still be submittable (no accomplishments needed). → Task 3 test `submittable when all days are ABSENT/HOLIDAY`.
5. **Pending hours must never leak into `renderedHours`** or the projected completion date. → Task 2 test `pending hours are reported separately…`.

---

### Task 1: Phase 4 schema migration (all workstreams)

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations_manual/005_phase4_columns.sql`

**Interfaces:**

- Produces (Prisma fields): `DailyReportEntry.timeIn String?`, `DailyReportEntry.timeOut String?`, `Notification.readAt DateTime?`, `StudentProfile.fullName String?`, `Company.supervisorPosition String?`. Consumed by Tasks 3, 6 (this plan), the endorsement plan (E), and the notification plan (C).

- [ ] **Step 1: Edit `prisma/schema.prisma`**

In `model DailyReportEntry`, after `toolsUsed`:

```prisma
  // Phase 4 (adviser request): optional wall-clock times, "HH:MM" Manila.
  timeIn           String?  @map("time_in")
  timeOut          String?  @map("time_out")
```

In `model Notification`, after `sentAt`:

```prisma
  readAt      DateTime?           @map("read_at") // IN_APP only; null = unread
```

In `model StudentProfile`, after `positionTitle`:

```prisma
  // FR-DG-01 endorsement letter needs the student's legal name; the users
  // table only holds an email. Nullable — set from the profile page.
  fullName             String?   @map("full_name")
```

In `model Company`, after `supervisorContact`:

```prisma
  supervisorPosition String?  @map("supervisor_position") // FR-DG-01
```

- [ ] **Step 2: Write the manual migration** `prisma/migrations_manual/005_phase4_columns.sql`

```sql
-- Phase 4: additive, nullable columns only — safe on a populated database,
-- no backfill. Run once in the Supabase SQL editor (or `npx prisma db push`
-- from a machine with DIRECT_URL set), after 001–004.
alter table daily_report_entries add column if not exists time_in text;
alter table daily_report_entries add column if not exists time_out text;
alter table notifications        add column if not exists read_at timestamptz;
alter table student_profiles     add column if not exists full_name text;
alter table companies            add column if not exists supervisor_position text;
```

- [ ] **Step 3: Validate and regenerate the client**

Run: `npx prisma validate && npx prisma generate && npx tsc --noEmit && npx jest`
Expected: schema valid; tsc clean; all existing tests PASS (the columns are unused so far).

- [ ] **Step 4: Apply to the dev DB** (Jay, or with Jay's explicit OK, since it's a shared resource)

Run the SQL from Step 2 in the Supabase SQL editor. Then check: `select column_name from information_schema.columns where table_name='daily_report_entries' and column_name like 'time_%';` → 2 rows.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations_manual/005_phase4_columns.sql
git commit -m "Add nullable Phase 4 columns (time in/out, read_at, full name, supervisor position)"
```

---

### Task 2: Confirmed vs. pending hours summary

**Files:**

- Modify: `src/lib/services/attendanceService.ts` (append), `src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/students/[studentProfileId]/attendance/page.tsx`
- Test: `src/lib/services/attendanceService.test.ts` (append)

**Interfaces:**

- Consumes: `calculateRenderedHours(studentProfileId, client?)` (existing); `isAwaitingReview` from `weeklyReportService`.
- Produces: `interface HoursSummary { requiredHours: number; confirmedHours: number; pendingHours: number; remainingHours: number; remainingIfPendingApproved: number }` and `getHoursSummary(studentProfileId: string): Promise<HoursSummary>`.

- [ ] **Step 1: Write the failing tests** (append; add `getHoursSummary` to the import list)

```ts
describe("getHoursSummary", () => {
  it("pending hours are reported separately and never counted as confirmed", async () => {
    // calculateRenderedHours: APPROVED/REGARDED reports only
    prismaMock.weeklyReport.findMany
      .mockResolvedValueOnce([{ dailyEntries: [{ actualHours: 40 }] }] as never)
      // reports awaiting review: one submitted (counts), one draft (doesn't)
      .mockResolvedValueOnce([
        {
          status: "PENDING",
          revisionHistory: [{ type: "SUBMITTED", timestamp: "t" }],
          dailyEntries: [{ actualHours: 8 }, { actualHours: 8 }],
        },
        { status: "PENDING", revisionHistory: [], dailyEntries: [{ actualHours: 8 }] },
      ] as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ requiredHours: 600 } as never);

    await expect(getHoursSummary("profile-1")).resolves.toEqual({
      requiredHours: 600,
      confirmedHours: 40,
      pendingHours: 16,
      remainingHours: 560,
      remainingIfPendingApproved: 544,
    });
    expect(prismaMock.studentProfile.update).not.toHaveBeenCalled();
  });

  it("never reports negative remaining hours", async () => {
    prismaMock.weeklyReport.findMany
      .mockResolvedValueOnce([{ dailyEntries: [{ actualHours: 610 }] }] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ requiredHours: 600 } as never);

    const summary = await getHoursSummary("profile-1");
    expect(summary.remainingHours).toBe(0);
    expect(summary.remainingIfPendingApproved).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/services/attendanceService.test.ts -t getHoursSummary`
Expected: FAIL. `getHoursSummary` is not exported.

- [ ] **Step 3: Implement** (append to `attendanceService.ts`)

`attendanceService` must not import `weeklyReportService` (that would create a cycle: weeklyReportService already imports attendanceService). So the awaiting-review rule is evaluated inline with the same definition Task 4 gives `isAwaitingReview`:

```ts
export interface HoursSummary {
  requiredHours: number;
  confirmedHours: number; // APPROVED/REGARDED only — the "true" hours (FR-AT-05)
  pendingHours: number; // submitted, awaiting faculty review — "temporary"
  remainingHours: number; // against confirmed only
  remainingIfPendingApproved: number;
}

// Lifecycle entry types in WeeklyReport.revisionHistory (see
// weeklyReportService). Kept here as a literal set to avoid an import cycle.
const REVISION_LIFECYCLE_TYPES = new Set(["SUBMITTED", "RETURNED"]);

function isSubmittedAwaitingReview(revisionHistory: unknown): boolean {
  const history = Array.isArray(revisionHistory) ? (revisionHistory as { type?: string }[]) : [];
  const lifecycle = history.filter((e) => e?.type && REVISION_LIFECYCLE_TYPES.has(e.type));
  return lifecycle[lifecycle.length - 1]?.type === "SUBMITTED";
}

// Read-only (no StudentProfile write) — safe to call on every page view.
export async function getHoursSummary(studentProfileId: string): Promise<HoursSummary> {
  const confirmedHours = await calculateRenderedHours(studentProfileId);
  const [openReports, profile] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: {
        studentProfileId,
        status: { in: [WeeklyReportStatus.PENDING, WeeklyReportStatus.RETURNED] },
      },
      select: {
        status: true,
        revisionHistory: true,
        dailyEntries: { select: { actualHours: true } },
      },
    }),
    prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentProfileId },
      select: { requiredHours: true },
    }),
  ]);

  const pendingHours =
    Math.round(
      openReports
        .filter(
          (r) =>
            r.status === WeeklyReportStatus.PENDING && isSubmittedAwaitingReview(r.revisionHistory)
        )
        .reduce(
          (sum, r) => sum + r.dailyEntries.reduce((s, e) => s + Number(e.actualHours ?? 0), 0),
          0
        ) * 100
    ) / 100;

  const required = profile.requiredHours;
  return {
    requiredHours: required,
    confirmedHours,
    pendingHours,
    remainingHours: Math.max(0, Math.round((required - confirmedHours) * 100) / 100),
    remainingIfPendingApproved: Math.max(
      0,
      Math.round((required - confirmedHours - pendingHours) * 100) / 100
    ),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/lib/services/attendanceService.test.ts`
Expected: PASS.

- [ ] **Step 5: Show it in the UI**

In `students/[studentProfileId]/attendance/page.tsx`:

- Replace the `calculateRenderedHours(...)` and `studentProfile` entries in the `Promise.all` with `getHoursSummary(params.studentProfileId)`. Derive `renderedHours = summary.confirmedHours`, `requiredHours = summary.requiredHours`, `remainingHours = summary.remainingHours`.
- Under "Hours rendered", add:

```tsx
{
  summary.pendingHours > 0 && (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      +{summary.pendingHours} hrs pending faculty review
    </p>
  );
}
```

- Change the progress caption to:

```tsx
              {progressPercent}% confirmed · pending hours count only after faculty approval
              {summary.pendingHours > 0 &&
                ` · ${summary.remainingIfPendingApproved} hrs left if pending reports are approved`}
```

In `(dashboard)/page.tsx` (student branch): replace `calculateRenderedHours(studentProfile.id)` with `getHoursSummary(studentProfile.id)` in the `Promise.all`, and render the "Hours rendered" card as:

```tsx
<StatCard
  label="Hours rendered (confirmed)"
  value={`${hours.confirmedHours} / ${hours.requiredHours}`}
  icon={Timer}
  tone="blue"
  hint={
    hours.pendingHours > 0
      ? `+${hours.pendingHours} hrs pending review`
      : `${Math.min(100, Math.round((hours.confirmedHours / Math.max(1, hours.requiredHours)) * 100))}% of required hours`
  }
/>
```

(Rename the destructured variable from `renderedHours` to `hours`, and delete the separate `requiredHours` const, which is now `hours.requiredHours`.)

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npx next lint && npx jest`
Expected: clean / PASS.

```bash
git add src/lib/services/attendanceService.ts src/lib/services/attendanceService.test.ts "src/app/(dashboard)/page.tsx" "src/app/(dashboard)/students/[studentProfileId]/attendance/page.tsx"
git commit -m "Show confirmed vs pending hours on dashboard and attendance"
```

---

### Task 3: Attendance status picker and time in/out per day

**Files:**

- Modify: `src/lib/validators/report.ts`, `src/lib/services/weeklyReportService.ts` (`saveDailyAccomplishment`, `recordWeeklyReportSubmission`), `src/app/api/weekly-reports/[id]/route.ts`, `…/weekly-reports/weekly-report-form.tsx`, `…/weekly-reports/page.tsx` (pass the new fields), `src/lib/documents/weeklyReportTemplate.ts` + `weeklyReportData.ts` (show status/times on the PDF, if Workstream A is merged)
- Test: `src/lib/validators/report.test.ts`, `src/lib/services/weeklyReportService.test.ts`

**Interfaces:**

- Produces:
  - `ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HOLIDAY"] as const`; `type AttendanceStatus`.
  - `minutesBetween(timeIn: string, timeOut: string): number`, exported from `src/lib/validators/report.ts`.
  - `dailyEntrySchema` gains `attendanceStatus` (default `"PRESENT"`), `timeIn?`, `timeOut?`.
  - `saveDailyAccomplishment(dailyReportEntryId, hours, accomplishments, studentUserId, toolsUsed?, details?: { attendanceStatus?: AttendanceStatus; timeIn?: string | null; timeOut?: string | null })`.

- [ ] **Step 1: Write the failing validator tests** (append to `src/lib/validators/report.test.ts`)

```ts
import { dailyEntrySchema, minutesBetween } from "@/lib/validators/report";

const base = { dailyReportEntryId: "8a213754-eeaf-4ddb-abf2-b78af4a2af61" };

describe("dailyEntrySchema attendance status and times", () => {
  it("defaults to PRESENT and requires accomplishments when present", () => {
    expect(dailyEntrySchema.safeParse({ ...base, hours: 8, accomplishments: "" }).success).toBe(
      false
    );
    const ok = dailyEntrySchema.parse({ ...base, hours: 8, accomplishments: "Built login" });
    expect(ok.attendanceStatus).toBe("PRESENT");
  });

  it("ABSENT and HOLIDAY need no accomplishments and must be 0 hours", () => {
    expect(
      dailyEntrySchema.safeParse({
        ...base,
        hours: 0,
        accomplishments: "",
        attendanceStatus: "ABSENT",
      }).success
    ).toBe(true);
    expect(
      dailyEntrySchema.safeParse({
        ...base,
        hours: 4,
        accomplishments: "",
        attendanceStatus: "HOLIDAY",
      }).success
    ).toBe(false);
  });

  it("rejects time out before time in", () => {
    const r = dailyEntrySchema.safeParse({
      ...base,
      hours: 8,
      accomplishments: "x",
      timeIn: "17:00",
      timeOut: "08:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects hours larger than the time window", () => {
    const r = dailyEntrySchema.safeParse({
      ...base,
      hours: 9,
      accomplishments: "x",
      timeIn: "08:00",
      timeOut: "16:00",
    });
    expect(r.success).toBe(false);
  });

  it("accepts hours within the window (lunch excluded by the student)", () => {
    const r = dailyEntrySchema.safeParse({
      ...base,
      hours: 8,
      accomplishments: "x",
      timeIn: "08:00",
      timeOut: "17:00",
    });
    expect(r.success).toBe(true);
  });

  it("rejects malformed times", () => {
    expect(
      dailyEntrySchema.safeParse({
        ...base,
        hours: 1,
        accomplishments: "x",
        timeIn: "8am",
        timeOut: "09:00",
      }).success
    ).toBe(false);
  });
});

describe("minutesBetween", () => {
  it("counts minutes between HH:MM times", () => {
    expect(minutesBetween("08:00", "17:30")).toBe(570);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/validators/report.test.ts`
Expected: FAIL. `minutesBetween` is not exported and the new fields are unknown.

- [ ] **Step 3: Implement the validator** (replace `dailyEntrySchema` in `src/lib/validators/report.ts`)

```ts
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HOLIDAY"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

export function minutesBetween(timeIn: string, timeOut: string): number {
  const [inH, inM] = timeIn.split(":").map(Number);
  const [outH, outM] = timeOut.split(":").map(Number);
  return outH * 60 + outM - (inH * 60 + inM);
}

export const dailyEntrySchema = z
  .object({
    dailyReportEntryId: z.uuid(),
    hours: z.number().min(0).max(24),
    accomplishments: z.string().trim().max(5000),
    toolsUsed: z.string().trim().max(500).optional(),
    attendanceStatus: z.enum(ATTENDANCE_STATUSES).default("PRESENT"),
    timeIn: timeOfDay.optional(),
    timeOut: timeOfDay.optional(),
  })
  .refine((d) => d.attendanceStatus !== "PRESENT" || d.accomplishments.length > 0, {
    message: "Accomplishments are required",
    path: ["accomplishments"],
  })
  .refine((d) => d.attendanceStatus === "PRESENT" || d.hours === 0, {
    message: "Absent and holiday days must have 0 hours",
    path: ["hours"],
  })
  .refine((d) => !d.timeIn || !d.timeOut || minutesBetween(d.timeIn, d.timeOut) > 0, {
    message: "Time out must be after time in",
    path: ["timeOut"],
  })
  .refine(
    (d) => !d.timeIn || !d.timeOut || d.hours * 60 <= minutesBetween(d.timeIn, d.timeOut) + 0.5,
    { message: "Hours can't exceed the time between time in and time out", path: ["hours"] }
  );
```

- [ ] **Step 4: Write the failing service tests** (append to `weeklyReportService.test.ts`, inside `describe("saveDailyAccomplishment", …)` and `describe("recordWeeklyReportSubmission", …)`)

```ts
it("ABSENT forces 0 hours and stores status and times", async () => {
  mockEntry(WeeklyReportStatus.PENDING);
  prismaMock.dailyReportEntry.update.mockResolvedValue({
    id: "entry-1",
    actualHours: 0,
    accomplishments: "",
  } as never);

  await saveDailyAccomplishment("entry-1", 5, "", "student-1", undefined, {
    attendanceStatus: "ABSENT",
    timeIn: null,
    timeOut: null,
  });

  expect(prismaMock.dailyReportEntry.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        actualHours: 0,
        attendanceStatus: "ABSENT",
        timeIn: null,
        timeOut: null,
      }),
    })
  );
});
```

```ts
it("submittable when all days are ABSENT/HOLIDAY (no accomplishments needed)", async () => {
  prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
    status: WeeklyReportStatus.PENDING,
    weekEnd: new Date("2026-10-11T00:00:00Z"),
    revisionHistory: [],
    dailyEntries: [
      { actualHours: 0, accomplishments: null, attendanceStatus: "HOLIDAY" },
      { actualHours: 0, accomplishments: "", attendanceStatus: "ABSENT" },
    ],
  } as never);
  await expect(
    recordWeeklyReportSubmission(
      "wr-1",
      { referenceCode: "WR-1", timestamp: new Date("2026-10-12T02:00:00Z") },
      actingUser
    )
  ).resolves.toEqual(expect.objectContaining({ type: "SUBMITTED" }));
});

it("still rejects an unfilled SCHEDULED day", async () => {
  prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
    status: WeeklyReportStatus.PENDING,
    weekEnd: new Date("2026-10-11T00:00:00Z"),
    revisionHistory: [],
    dailyEntries: [{ actualHours: null, accomplishments: null, attendanceStatus: "SCHEDULED" }],
  } as never);
  await expect(
    recordWeeklyReportSubmission("wr-1", { referenceCode: "x", timestamp: new Date() }, actingUser)
  ).rejects.toThrow(WeeklyReportIncompleteError);
});
```

Also update the existing `filledEntries` constant in that describe to include `attendanceStatus: "PRESENT"`.

- [ ] **Step 5: Run to verify they fail**

Run: `npx jest src/lib/services/weeklyReportService.test.ts`
Expected: FAIL. Status isn't stored, and an all-HOLIDAY week is rejected as incomplete.

- [ ] **Step 6: Implement the service changes** (`weeklyReportService.ts`)

Change the `saveDailyAccomplishment` signature and update data:

```ts
export async function saveDailyAccomplishment(
  dailyReportEntryId: string,
  hours: number,
  accomplishments: string,
  studentUserId: string,
  toolsUsed?: string | null,
  details: {
    attendanceStatus?: "PRESENT" | "ABSENT" | "HOLIDAY";
    timeIn?: string | null;
    timeOut?: string | null;
  } = {}
): Promise<{ id: string; hours: number; accomplishments: string }> {
```

and replace the `data:` object in its `tx.dailyReportEntry.update` with:

```ts
      data: (() => {
        // Explicit status wins; legacy callers (no status) keep the old
        // hours-derived behaviour. Non-PRESENT days always count 0 hours.
        const status = details.attendanceStatus ?? (hours > 0 ? "PRESENT" : "ABSENT");
        const isPresent = status === "PRESENT";
        return {
          actualHours: isPresent ? hours : 0,
          accomplishments,
          ...(toolsUsed !== undefined ? { toolsUsed: toolsUsed || null } : {}),
          attendanceStatus: status,
          ...(details.timeIn !== undefined ? { timeIn: details.timeIn } : {}),
          ...(details.timeOut !== undefined ? { timeOut: details.timeOut } : {}),
        };
      })(),
```

In `recordWeeklyReportSubmission`, select `attendanceStatus` on `dailyEntries` and replace the `incomplete` computation with:

```ts
const incomplete =
  report.dailyEntries.length === 0 ||
  report.dailyEntries.some((e) => {
    if (e.actualHours == null || e.attendanceStatus === "SCHEDULED") return true;
    return e.attendanceStatus === "PRESENT" && !e.accomplishments?.trim();
  });
```

In `src/app/api/weekly-reports/[id]/route.ts` PATCH, destructure `attendanceStatus, timeIn, timeOut` from `dailyEntrySchema.parse(body)` and pass them through:

```ts
const entry = await saveDailyAccomplishment(
  dailyReportEntryId,
  hours,
  accomplishments,
  user.id,
  toolsUsed,
  { attendanceStatus, timeIn: timeIn ?? null, timeOut: timeOut ?? null }
);
```

- [ ] **Step 7: Update the form UI** (`weekly-report-form.tsx`)

1. Extend `DailyEntryRow` with `attendanceStatus: string; timeIn: string | null; timeOut: string | null;` and `RowState` with `status: "PRESENT" | "ABSENT" | "HOLIDAY"; timeIn: string; timeOut: string;`. Initialise `status` from `e.attendanceStatus === "SCHEDULED" ? "PRESENT" : e.attendanceStatus`.
2. In each editable row, before the Hours input, add a status select and two time inputs:

```tsx
<div className="space-y-1">
  <Label htmlFor={`status-${entry.id}`} className="text-xs">
    Status
  </Label>
  <select
    id={`status-${entry.id}`}
    value={row.status}
    disabled={isPending}
    onChange={(e) => {
      const status = e.target.value as RowState["status"];
      updateRow(
        entry.id,
        status === "PRESENT" ? { status } : { status, hours: "0", timeIn: "", timeOut: "" }
      );
    }}
    className="flex h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm"
  >
    <option value="PRESENT">Present</option>
    <option value="ABSENT">Absent</option>
    <option value="HOLIDAY">Holiday</option>
  </select>
</div>;
{
  row.status === "PRESENT" && (
    <div className="flex gap-2">
      <Input
        type="time"
        aria-label={`Time in on ${formatDay(entry.reportDate)}`}
        value={row.timeIn}
        disabled={isPending}
        onChange={(e) => updateRow(entry.id, withAutoHours({ ...row, timeIn: e.target.value }))}
      />
      <Input
        type="time"
        aria-label={`Time out on ${formatDay(entry.reportDate)}`}
        value={row.timeOut}
        disabled={isPending}
        onChange={(e) => updateRow(entry.id, withAutoHours({ ...row, timeOut: e.target.value }))}
      />
    </div>
  );
}
```

with this helper above the component. It fills hours from the time window minus a 1-hour lunch for spans over 5 h, and the student can still edit hours down:

```tsx
import { minutesBetween } from "@/lib/validators/report";

function withAutoHours(row: RowState): Partial<RowState> {
  if (!row.timeIn || !row.timeOut) return { timeIn: row.timeIn, timeOut: row.timeOut };
  const minutes = minutesBetween(row.timeIn, row.timeOut);
  if (minutes <= 0) return { timeIn: row.timeIn, timeOut: row.timeOut };
  const worked = minutes > 300 ? minutes - 60 : minutes;
  return {
    timeIn: row.timeIn,
    timeOut: row.timeOut,
    hours: String(Math.round((worked / 60) * 4) / 4),
  };
}
```

3. Hide or disable the Hours and Accomplishments inputs when `row.status !== "PRESENT"`. In `rowProblem`, skip the accomplishments check for non-PRESENT rows. In `saveDirtyRows`, send `attendanceStatus: row.status, timeIn: row.timeIn || undefined, timeOut: row.timeOut || undefined`.
4. Skip non-PRESENT rows in the copy-paste check (they have no text).
5. In `weekly-reports/page.tsx`, pass `attendanceStatus: e.attendanceStatus, timeIn: e.timeIn, timeOut: e.timeOut` in the `entries` mapping. In the read-only table, show `entry.attendanceStatus` and `timeIn–timeOut` when set.
6. If Workstream A is merged: add `attendanceStatus`, `timeIn` and `timeOut` to `WeeklyReportDocumentData.entries`. Select them in `weeklyReportData.ts` and render `Status` and `Time` columns in `renderWeeklyReportHtml`, with each value through `escapeHtml`.

- [ ] **Step 8: Run everything and commit**

Run: `npx jest && npx tsc --noEmit && npx next lint`
Expected: PASS / clean.

```bash
git add src/lib/validators src/lib/services/weeklyReportService.ts src/lib/services/weeklyReportService.test.ts "src/app/api/weekly-reports/[id]/route.ts" "src/app/(dashboard)/students/[studentProfileId]/weekly-reports" src/lib/documents
git commit -m "Add per-day attendance status and time in/out to weekly reports"
```

---

### Task 4: Signed-copy upload (D2 default: optional)

**Files:**

- Modify: `src/lib/services/weeklyReportService.ts` (`isAwaitingReview`; new `attachSignedCopy`, `getLatestSignedCopy`)
- Create: `src/app/api/weekly-reports/[id]/signed-copy/route.ts`, `…/weekly-reports/signed-copy-upload.tsx`
- Modify: `…/weekly-reports/page.tsx`, `…/[weeklyReportId]/review/page.tsx`
- Test: `src/lib/services/weeklyReportService.test.ts` (append)

**Interfaces:**

- Produces:
  - `interface SignedCopyEntry { type: "SIGNED_COPY_UPLOADED"; timestamp: string; path: string; uploadedBy: string }`
  - `getLatestSignedCopy(revisionHistory: unknown): SignedCopyEntry | null`
  - `attachSignedCopy(weeklyReportId: string, path: string, actingUser: { id: string; role: Role }, ipAddress?: string | null): Promise<SignedCopyEntry>` (throws `SignedCopyNotAllowedError` if never submitted or DISREGARDED)
  - `class SignedCopyNotAllowedError extends Error`
  - Routes: `POST /api/weekly-reports/[id]/signed-copy` (multipart `file`; owning student only), `GET` (signed-URL redirect; anyone with student access).

- [ ] **Step 1: Write the failing tests**

```ts
describe("signed copies (D2)", () => {
  const actingUser = { id: "student-1", role: Role.STUDENT_INTERN };

  it("stays locked after a signed copy is attached while awaiting review", () => {
    const report = {
      status: WeeklyReportStatus.PENDING,
      revisionHistory: [
        { type: "SUBMITTED", timestamp: "t1" },
        { type: "SIGNED_COPY_UPLOADED", timestamp: "t2", path: "p", uploadedBy: "s" },
      ],
    };
    expect(isAwaitingReview(report)).toBe(true);
    expect(isWeeklyReportEditable(report)).toBe(false);
  });

  it("appends a SIGNED_COPY_UPLOADED entry without changing status", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.APPROVED,
      revisionHistory: [{ type: "SUBMITTED", timestamp: "t1", referenceCode: "WR-1" }],
    } as never);

    const entry = await attachSignedCopy("wr-1", "signed-copies/p-1/wr-1.pdf", actingUser);

    expect(entry).toEqual(
      expect.objectContaining({ type: "SIGNED_COPY_UPLOADED", path: "signed-copies/p-1/wr-1.pdf" })
    );
    const updateArg = prismaMock.weeklyReport.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data).not.toHaveProperty("status");
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "SIGNED_COPY_UPLOADED" }) })
    );
  });

  it("refuses a report that was never submitted", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      revisionHistory: [],
    } as never);
    await expect(attachSignedCopy("wr-1", "x.pdf", actingUser)).rejects.toThrow(
      SignedCopyNotAllowedError
    );
  });

  it("getLatestSignedCopy returns the most recent upload", () => {
    expect(
      getLatestSignedCopy([
        { type: "SIGNED_COPY_UPLOADED", timestamp: "t1", path: "old" },
        { type: "SIGNED_COPY_UPLOADED", timestamp: "t2", path: "new" },
      ])?.path
    ).toBe("new");
  });
});
```

(Add `attachSignedCopy, getLatestSignedCopy, isAwaitingReview, isWeeklyReportEditable, SignedCopyNotAllowedError` to the import list.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/services/weeklyReportService.test.ts -t "signed copies"`
Expected: FAIL. The first test fails on the current `isAwaitingReview`, and the rest are missing exports.

- [ ] **Step 3: Implement** (`weeklyReportService.ts`)

Replace `isAwaitingReview` with a lifecycle-aware version:

```ts
// Only these entry types move a report through review. Informational entries
// (e.g. SIGNED_COPY_UPLOADED) must never change locked/unlocked state.
const LIFECYCLE_ENTRY_TYPES = new Set(["SUBMITTED", "RETURNED"]);

export function isAwaitingReview(report: {
  status: WeeklyReportStatus;
  revisionHistory: unknown;
}): boolean {
  if (FINAL_STATUSES.has(report.status)) return false;
  const lifecycle = getWeeklyReportHistory(report.revisionHistory).filter((e) =>
    LIFECYCLE_ENTRY_TYPES.has(e.type)
  );
  return lifecycle[lifecycle.length - 1]?.type === "SUBMITTED";
}
```

Append:

```ts
export interface SignedCopyEntry extends WeeklyReportHistoryEntry {
  type: "SIGNED_COPY_UPLOADED";
  path: string;
  uploadedBy: string;
}

export class SignedCopyNotAllowedError extends Error {
  constructor(message = "Submit the report before uploading its signed copy") {
    super(message);
    this.name = "SignedCopyNotAllowedError";
  }
}

export function getLatestSignedCopy(revisionHistory: unknown): SignedCopyEntry | null {
  const history = getWeeklyReportHistory(revisionHistory);
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].type === "SIGNED_COPY_UPLOADED") return history[i] as SignedCopyEntry;
  }
  return null;
}

// D2 default: optional evidence of the company supervisor's signature,
// recorded on the report's history (no schema change). Allowed any time
// after submission — including after approval, when signing usually happens
// — but never on a disregarded report.
export async function attachSignedCopy(
  weeklyReportId: string,
  path: string,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<SignedCopyEntry> {
  return prisma.$transaction(async (tx) => {
    const report = await tx.weeklyReport.findUniqueOrThrow({
      where: { id: weeklyReportId },
      select: { status: true, revisionHistory: true },
    });
    if (
      report.status === WeeklyReportStatus.DISREGARDED ||
      !getLatestSubmission(report.revisionHistory)
    ) {
      throw new SignedCopyNotAllowedError();
    }

    const entry: SignedCopyEntry = {
      type: "SIGNED_COPY_UPLOADED",
      timestamp: new Date().toISOString(),
      path,
      uploadedBy: actingUser.id,
    };
    await tx.weeklyReport.update({
      where: { id: weeklyReportId },
      data: {
        revisionHistory: [
          ...getWeeklyReportHistory(report.revisionHistory),
          entry,
        ] as unknown as Prisma.InputJsonValue,
      },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: "SIGNED_COPY_UPLOADED",
        entityType: "WeeklyReport",
        entityId: weeklyReportId,
        ipAddress,
      },
      tx
    );
    return entry;
  });
}
```

Add `SignedCopyNotAllowedError` to `BAD_REQUEST_ERRORS` in `src/lib/utils/apiError.ts`.

- [ ] **Step 4: Route** `src/app/api/weekly-reports/[id]/signed-copy/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import {
  attachSignedCopy,
  getLatestSignedCopy,
  getWeeklyReport,
} from "@/lib/services/weeklyReportService";
import { CHECKLIST_BUCKET, getSignedUrl, uploadFile, validateUpload } from "@/lib/storage";
import { handleApiError } from "@/lib/utils/apiError";

// Student uploads the manager-signed scan (multipart field `file`).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const report = await getWeeklyReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertCanAccessStudent(user, report.studentProfileId);

    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    validateUpload(file);
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = await uploadFile(
      CHECKLIST_BUCKET,
      `signed-copies/${report.studentProfileId}/${params.id}.${ext}`,
      file
    );
    const entry = await attachSignedCopy(params.id, path, user, req.headers.get("x-forwarded-for"));
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// Student, their faculty, coordinator/admin: view the latest signed copy.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    const report = await getWeeklyReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertCanAccessStudent(user, report.studentProfileId);
    const signed = getLatestSignedCopy(report.revisionHistory);
    if (!signed) return NextResponse.json({ error: "No signed copy uploaded" }, { status: 404 });
    return NextResponse.redirect(await getSignedUrl(CHECKLIST_BUCKET, signed.path));
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 5: UI** `…/weekly-reports/signed-copy-upload.tsx`

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheck2, Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SignedCopyUpload({
  weeklyReportId,
  hasSignedCopy,
  canUpload,
}: {
  weeklyReportId: string;
  hasSignedCopy: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, setIsPending] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    setIsPending(true);
    const res = await fetch(`/api/weekly-reports/${weeklyReportId}/signed-copy`, {
      method: "POST",
      body: form,
    });
    setIsPending(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Upload failed");
      return;
    }
    toast.success("Signed copy uploaded");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {hasSignedCopy && (
        <a
          href={`/api/weekly-reports/${weeklyReportId}/signed-copy`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "cursor-pointer gap-1.5"
          )}
        >
          <FileCheck2 className="size-3.5" aria-hidden="true" />
          Signed copy
        </a>
      )}
      {canUpload && (
        <label
          htmlFor={`signed-${weeklyReportId}`}
          title="PDF up to 5MB, or JPG/PNG up to 2MB"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "cursor-pointer gap-1.5",
            isPending && "pointer-events-none opacity-50"
          )}
        >
          <Upload className="size-3.5" aria-hidden="true" />
          {isPending
            ? "Uploading..."
            : hasSignedCopy
              ? "Replace signed copy"
              : "Upload signed copy"}
          <input
            id={`signed-${weeklyReportId}`}
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={onChange}
            disabled={isPending}
          />
        </label>
      )}
    </div>
  );
}
```

In `weekly-reports/page.tsx`, next to the PDF actions inside the `submission &&` block, add:

```tsx
<SignedCopyUpload
  weeklyReportId={report.id}
  hasSignedCopy={getLatestSignedCopy(report.revisionHistory) !== null}
  canUpload={isOwner && report.status !== "DISREGARDED"}
/>
```

In the faculty review page (`[weeklyReportId]/review/page.tsx`), under the header `CardDescription`, add a "Signed copy" link (the same anchor as above) when `getLatestSignedCopy(report!.revisionHistory)` is non-null, else muted text "No signed copy uploaded yet".

- [ ] **Step 6: Verify and commit**

Run: `npx jest && npx tsc --noEmit && npx next lint && npx next build`
Expected: green.

```bash
git add src/lib/services/weeklyReportService.ts src/lib/services/weeklyReportService.test.ts src/lib/utils/apiError.ts "src/app/api/weekly-reports/[id]/signed-copy" "src/app/(dashboard)/students/[studentProfileId]/weekly-reports"
git commit -m "Let students upload the manager-signed copy of a submitted report"
```

---

## Self-review (completed)

- **Spec coverage:**
  - Pending vs. confirmed hours: Task 2.
  - FR-WR-02 attendance status (Present/Absent/Holiday): Task 3.
  - Adviser's daily time fields: Task 3.
  - D2 signed copy: Task 4.
  - Schema columns for C and E: Task 1.
  - Monthly narrative: deliberately excluded under D3, with the reason stated in "Decisions applied".
- **Placeholders:** none.
- **Types:** `AttendanceStatus` is consistent between the validator, service and form; `SignedCopyEntry` between the service, route and page.
- **Review Focus:** all five map to named tests.
