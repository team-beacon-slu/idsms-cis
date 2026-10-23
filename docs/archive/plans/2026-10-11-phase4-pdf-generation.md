# Server-Side Report PDF Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Submitted weekly and monthly reports produce a stored, downloadable A4 PDF carrying the system reference code and timestamp, rendered server-side by Puppeteer. The pipeline survives Chrome failures with 3 retries plus a Regenerate button.

**Architecture:**

- One pure HTML template per document type (`src/lib/documents/*`) is the single source of layout. The browser preview shows it in an `<iframe srcDoc>`, and the server prints the same HTML to PDF with `puppeteer-core` (`@sparticuz/chromium` on Linux/Vercel, local Chrome/Edge via `PUPPETEER_EXECUTABLE_PATH` elsewhere).
- `documentService` owns the lifecycle: it upserts the `generated_documents` row, renders and uploads with retry, then marks the row GENERATED or FAILED.
- Generation is triggered by its own route, called right after submit, so a PDF failure never fails a submission.

**Tech Stack:** Next.js 14 App Router (Node runtime) · TypeScript · Prisma 6 · Supabase Storage (service-role, private bucket) · puppeteer-core 25.9 · @sparticuz/chromium 149 · Jest 30 + jest-mock-extended.

**Spec:** `PRD.md` Module 8 (FR-DG-03, -04, -05, -06, -07), FR-WR-09, FR-WR-10, FR-WR-08; umbrella plan `docs/superpowers/plans/2026-10-11-phase4-roadmap.md` (Workstream A, risks R2, R8, R11, R14).

## Global Constraints

- FR-DG-04: "All generated PDFs must include a system-generated reference code and timestamp for traceability and accreditation purposes."
- FR-DG-05: "PDF generation must only occur after the student has reviewed and confirmed report contents in the system." Weekly: only when `getLatestSubmission(revisionHistory)` is non-null. Monthly: only for an existing MONTHLY_REPORT row.
- FR-DG-06: "PDF generation must be performed server-side using Puppeteer (headless Chrome)."
- FR-DG-07: "…retains the submission data, logs the error, sets the document status to `failed`, and provides a "Regenerate PDF" button… a maximum of 3 retries with exponential backoff." That's 1 attempt plus up to 3 retries, with delays of 1 s, 2 s and 4 s.
- Storage caps: PDF ≤ 5 MB (`MAX_PDF_BYTES` in `src/lib/storage.ts`).
- No `NEXT_PUBLIC_SUPABASE_*` variable, ever. Storage stays server-only and private; downloads use signed URLs.
- Calendar dates (`weekStart`, `weekEnd`, `reportDate`) render with `timeZone: "UTC"`. Instants (`submittedAt`, generation time) render with `timeZone: "Asia/Manila"`. Never use the server's default timezone (risk R8).
- No schema changes. Use the existing `GeneratedDocument` model (`referenceCode @unique`, `periodLabel`, `status`, `fileUrl`, `generatedAt`).
- Commits carry no Claude/Anthropic attribution (repo owner's standing preference).
- Every task leaves `npx tsc --noEmit`, `npx next lint`, and `npx jest` green.

## Review Focus

1. **Text that breaks out of HTML.** Accomplishments containing `<script>`, `</td>`, `&`, or quotes must render as literal text in both the iframe preview and the PDF. → test in Task 2 (`escapes HTML in every interpolated field`).
2. **Regenerating after a resubmission.** A Returned-then-resubmitted report gets a new reference code. The existing document row must be updated in place (no second row, no unique-constraint crash on `referenceCode`). → test in Task 5 (`reuses the existing row for the same week and updates its reference code`).
3. **Chrome never comes up (local Windows without `PUPPETEER_EXECUTABLE_PATH`, or a Vercel cold start).** The row ends FAILED, the error is logged, and the HTTP response is 200 with `status: "FAILED"`, not a 500. → tests in Task 5 (`marks FAILED after 4 attempts…`) and Task 6 (`returns 200 with FAILED status`).
4. **Generating before submission** (a direct POST to the route on a draft). Must be refused with 400 and no row created (FR-DG-05). → test in Task 5 (`refuses a report that has not been submitted`).
5. **A faculty member downloads a PDF for a student not in their class group.** Must get 403 through `assertCanAccessStudent`. → test in Task 6 (`GET refuses a user who cannot access the student`).

---

## File Structure

| File                                                                                                                            | Responsibility                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `prisma/migrations_manual/004_generated_documents_bucket.sql` (create)                                                          | Provision the private `generated-documents` bucket                                     |
| `src/lib/storage.ts` (modify)                                                                                                   | `GENERATED_DOCUMENTS_BUCKET`, `uploadPdfBuffer()` for server-made buffers              |
| `src/lib/documents/html.ts` (create)                                                                                            | `escapeHtml`, date formatters, shared print CSS                                        |
| `src/lib/documents/weeklyReportTemplate.ts` (create)                                                                            | `WeeklyReportDocumentData` type + pure `renderWeeklyReportHtml()`                      |
| `src/lib/documents/weeklyReportData.ts` (create)                                                                                | `loadWeeklyReportDocumentData()`: Prisma → template data                               |
| `src/lib/pdf/renderHtmlToPdf.ts` (create)                                                                                       | Browser resolution + `renderHtmlToPdf()`                                               |
| `src/lib/services/documentService.ts` (replace stub)                                                                            | `withRetry`, `generateWeeklyReportPdf`, `getWeeklyReportDocument`, monthly equivalents |
| `src/app/api/weekly-reports/[id]/pdf/route.ts` (create)                                                                         | GET → signed-URL redirect; POST → generate/regenerate                                  |
| `src/app/api/monthly-reports/[id]/pdf/route.ts` (create)                                                                        | same for monthly                                                                       |
| `src/lib/utils/apiError.ts` (modify)                                                                                            | map `DocumentNotReadyError` → 400                                                      |
| `src/lib/documents/monthlyReportTemplate.ts` + `monthlyReportData.ts` (create)                                                  | Monthly template + loader                                                              |
| `src/app/(dashboard)/students/[studentProfileId]/weekly-reports/report-pdf-actions.tsx` (create)                                | Download / Generate / Regenerate buttons                                               |
| `…/weekly-reports/page.tsx`, `weekly-report-form.tsx`, `[weeklyReportId]/preview/page.tsx`, `preview/print-button.tsx` (modify) | Wire the UI; preview uses the shared template                                          |
| `…/monthly-reports/monthly-report-view.tsx`, `page.tsx` (modify)                                                                | Monthly PDF actions                                                                    |
| `next.config.mjs` (modify)                                                                                                      | Keep puppeteer-core/@sparticuz/chromium out of the webpack bundle                      |
| `.env.example` (modify)                                                                                                         | Document `PUPPETEER_EXECUTABLE_PATH`                                                   |

---

### Task 1: Generated-documents bucket and PDF buffer upload

**Files:**

- Create: `prisma/migrations_manual/004_generated_documents_bucket.sql`
- Modify: `src/lib/storage.ts` (append after `uploadFile`)
- Test: `src/lib/storage.test.ts` (append)

**Interfaces:**

- Produces: `export const GENERATED_DOCUMENTS_BUCKET = "generated-documents"`; `export async function uploadPdfBuffer(bucket: string, path: string, pdf: Buffer): Promise<string>` (returns `path`; throws `InvalidFileError` if over 5 MB or on Storage error).

- [ ] **Step 1: Write the failing tests** (append to `src/lib/storage.test.ts`, and add `GENERATED_DOCUMENTS_BUCKET, uploadPdfBuffer` to its import list)

```ts
describe("uploadPdfBuffer", () => {
  it("uploads a PDF buffer with upsert and the PDF content type", async () => {
    mockUpload.mockResolvedValue({ error: null });
    const pdf = Buffer.from("%PDF-1.4 test");

    const path = await uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, "weekly/p1/wr1.pdf", pdf);

    expect(path).toBe("weekly/p1/wr1.pdf");
    expect(mockFrom).toHaveBeenCalledWith("generated-documents");
    expect(mockUpload).toHaveBeenCalledWith("weekly/p1/wr1.pdf", pdf, {
      upsert: true,
      contentType: "application/pdf",
    });
  });

  it("rejects a buffer over the 5MB PDF cap without calling Storage", async () => {
    const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, "x.pdf", tooBig)).rejects.toThrow(
      InvalidFileError
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("surfaces a Storage error as InvalidFileError", async () => {
    mockUpload.mockResolvedValue({ error: { message: "bucket not found" } });
    await expect(
      uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, "x.pdf", Buffer.from("%PDF"))
    ).rejects.toThrow("bucket not found");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/storage.test.ts`
Expected: FAIL. `uploadPdfBuffer` / `GENERATED_DOCUMENTS_BUCKET` are not exported.

- [ ] **Step 3: Implement** (in `src/lib/storage.ts`, next to the other bucket constants and after `uploadFile`)

```ts
export const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

// Server-generated PDFs (Module 8) arrive as Buffers, not browser Files, so
// validateUpload()'s File-based MIME check doesn't apply — the content type
// is fixed here and only the size cap needs enforcing.
export async function uploadPdfBuffer(bucket: string, path: string, pdf: Buffer): Promise<string> {
  if (pdf.byteLength > MAX_PDF_BYTES) {
    throw new InvalidFileError(
      `Generated PDF exceeds the ${MAX_PDF_BYTES / (1024 * 1024)}MB limit`
    );
  }

  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, pdf, {
    upsert: true,
    contentType: "application/pdf",
  });

  if (error) {
    throw new InvalidFileError(error.message);
  }

  return path;
}
```

Create `prisma/migrations_manual/004_generated_documents_bucket.sql`:

```sql
-- Manual migration — run once in the Supabase SQL editor, after 003.
-- Private bucket for server-generated PDFs (Module 8: weekly/monthly
-- reports, later endorsement letters). Object paths:
--   weekly/{studentProfileId}/{weeklyReportId}.pdf
--   monthly/{studentProfileId}/{calendarMonth}.pdf
-- Overwritten in place on regenerate (upsert), so one object per report.
-- Served only through server-created signed URLs (see 003's note on the
-- service-role key — that, plus public:false, is what keeps this private).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-documents', 'generated-documents', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/storage.test.ts`
Expected: PASS (all existing and new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts prisma/migrations_manual/004_generated_documents_bucket.sql
git commit -m "Add generated-documents bucket and PDF buffer upload"
```

---

### Task 2: Shared HTML helpers and the weekly report template

**Files:**

- Create: `src/lib/documents/html.ts`, `src/lib/documents/weeklyReportTemplate.ts`
- Test: `src/lib/documents/weeklyReportTemplate.test.ts`

**Interfaces:**

- Produces:
  - `escapeHtml(value: string | number | null | undefined): string`
  - `formatCalendarDate(date: Date, opts?: { weekday?: boolean }): string` (UTC, `en-PH`, "October 5, 2026")
  - `formatInstant(date: Date): string` (Asia/Manila, "Oct 12, 2026, 10:00 AM")
  - `PRINT_CSS: string`
  - `interface WeeklyReportDocumentData` (below) and `renderWeeklyReportHtml(data: WeeklyReportDocumentData): string` (a full `<!doctype html>` document).

- [ ] **Step 1: Write the failing tests** (`src/lib/documents/weeklyReportTemplate.test.ts`)

```ts
import { escapeHtml } from "@/lib/documents/html";
import {
  renderWeeklyReportHtml,
  type WeeklyReportDocumentData,
} from "@/lib/documents/weeklyReportTemplate";

function sample(overrides: Partial<WeeklyReportDocumentData> = {}): WeeklyReportDocumentData {
  return {
    weeklyReportId: "wr-1",
    studentProfileId: "p-1",
    referenceCode: "WR-20261005-ABCD1234",
    submittedAt: new Date("2026-10-12T02:00:00Z"),
    reasonForDelay: null,
    weekStart: new Date("2026-10-05T00:00:00Z"),
    weekEnd: new Date("2026-10-11T00:00:00Z"),
    dueDate: new Date("2026-10-13T00:00:00Z"),
    student: {
      email: "student.test@idsms.local",
      studentNumber: "2026-00123-MN-0",
      program: "BSIT",
      positionTitle: "Web Developer Intern",
      requiredHours: 600,
    },
    company: { name: "Acme Corp", supervisorName: "Juan Dela Cruz" },
    entries: [
      {
        reportDate: new Date("2026-10-05T00:00:00Z"),
        actualHours: 8,
        accomplishments: "Built the login page",
        toolsUsed: "VS Code",
      },
    ],
    totals: { totalHours: 8, runningTotal: 48, remainingHours: 552 },
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;"
    );
  });

  it("renders null/undefined as an em dash", () => {
    expect(escapeHtml(null)).toBe("—");
    expect(escapeHtml(undefined)).toBe("—");
  });
});

describe("renderWeeklyReportHtml", () => {
  it("includes the reference code, submission timestamp, and signature lines (FR-DG-04)", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).toContain("WR-20261005-ABCD1234");
    expect(html).toContain("Oct 12, 2026");
    expect(html).toContain("Company supervisor signature");
    expect(html).toContain("Student signature");
  });

  it("renders the week, totals, and each daily entry", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).toContain("October 5, 2026");
    expect(html).toContain("October 11, 2026");
    expect(html).toContain("Built the login page");
    expect(html).toContain("552 / 600 hrs");
  });

  it("escapes HTML in every interpolated field", () => {
    const html = renderWeeklyReportHtml(
      sample({
        entries: [
          {
            reportDate: new Date("2026-10-05T00:00:00Z"),
            actualHours: 8,
            accomplishments: "<script>alert(1)</script></td>",
            toolsUsed: `"quoted" & <b>`,
          },
        ],
        company: { name: "A&B <Corp>", supervisorName: "O'Neil" },
        reasonForDelay: "<img src=x onerror=alert(1)>",
      })
    );
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&lt;/td&gt;");
    expect(html).toContain("A&amp;B &lt;Corp&gt;");
  });

  it("shows the delay reason only when present", () => {
    expect(renderWeeklyReportHtml(sample())).not.toContain("Reason for late submission");
    expect(renderWeeklyReportHtml(sample({ reasonForDelay: "Typhoon" }))).toContain(
      "Reason for late submission"
    );
  });

  it("labels an unsubmitted preview instead of printing an empty reference code", () => {
    const html = renderWeeklyReportHtml(sample({ referenceCode: null, submittedAt: null }));
    expect(html).toContain("Issued on submission");
    expect(html).toContain("PREVIEW");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/documents/weeklyReportTemplate.test.ts`
Expected: FAIL. Cannot find module `@/lib/documents/html`.

- [ ] **Step 3: Implement**

`src/lib/documents/html.ts`:

```ts
// Shared helpers for Module 8 document templates. Templates are pure
// functions returning a full HTML document string, so the same markup feeds
// both the in-app preview (<iframe srcDoc>) and Puppeteer's page.pdf().

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Every value interpolated into a template goes through this — report text
// is student-authored and must never become markup.
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// weekStart/weekEnd/reportDate are calendar dates stored as UTC midnight —
// format in UTC so the server's timezone can't shift them a day.
export function formatCalendarDate(date: Date, opts: { weekday?: boolean } = {}): string {
  return date.toLocaleDateString("en-PH", {
    ...(opts.weekday ? { weekday: "short" as const } : {}),
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Real instants (submission time, generation time) are shown in Manila time.
export function formatInstant(date: Date): string {
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export const PRINT_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11pt; margin: 0; }
  header { text-align: center; border-bottom: 1px solid #999; padding-bottom: 8px; }
  .eyebrow { font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #555; margin: 0; }
  h1 { font-size: 16pt; margin: 4px 0; }
  .period { margin: 0; }
  .watermark { color: #b45309; font-weight: bold; letter-spacing: 3px; }
  dl.meta { display: grid; grid-template-columns: 9rem 1fr 9rem 1fr; gap: 2px 12px; margin: 12px 0; font-size: 10pt; }
  dl.meta dt { color: #555; }
  dl.meta dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10pt; }
  th, td { border-bottom: 1px solid #ccc; padding: 6px 4px; text-align: left; vertical-align: top; }
  tr { break-inside: avoid; }
  td.text { white-space: pre-wrap; }
  .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; text-align: center; }
  .totals div { border: 1px solid #999; border-radius: 4px; padding: 6px; }
  .totals dt { color: #555; font-size: 9pt; }
  .totals dd { margin: 0; font-weight: bold; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 56px; text-align: center; font-size: 9pt; }
  .signatures div { border-top: 1px solid #333; padding-top: 4px; }
  footer { margin-top: 24px; text-align: center; font-size: 8pt; color: #666; }
`;
```

`src/lib/documents/weeklyReportTemplate.ts`:

```ts
import { escapeHtml, formatCalendarDate, formatInstant, PRINT_CSS } from "@/lib/documents/html";

export interface WeeklyReportDocumentData {
  weeklyReportId: string;
  studentProfileId: string;
  referenceCode: string | null; // null until submitted (preview only)
  submittedAt: Date | null;
  reasonForDelay: string | null;
  weekStart: Date;
  weekEnd: Date;
  dueDate: Date;
  student: {
    email: string;
    studentNumber: string;
    program: string;
    positionTitle: string | null;
    requiredHours: number;
  };
  company: { name: string; supervisorName: string } | null;
  entries: {
    reportDate: Date;
    actualHours: number | null;
    accomplishments: string | null;
    toolsUsed: string | null;
  }[];
  totals: { totalHours: number; runningTotal: number; remainingHours: number };
}

// FR-DG-03/04 weekly report layout. Pure: same input → same HTML, no I/O.
export function renderWeeklyReportHtml(data: WeeklyReportDocumentData): string {
  const isPreview = data.referenceCode === null;
  const rows = data.entries
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(formatCalendarDate(entry.reportDate, { weekday: true }))}</td>
        <td>${escapeHtml(entry.actualHours)}</td>
        <td class="text">${escapeHtml(entry.accomplishments)}</td>
        <td>${escapeHtml(entry.toolsUsed)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Weekly Internship Report ${escapeHtml(data.referenceCode ?? "Preview")}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <header>
    <p class="eyebrow">Saint Louis University · SAMCIS</p>
    <h1>Weekly Internship Report</h1>
    <p class="period">${escapeHtml(formatCalendarDate(data.weekStart))} – ${escapeHtml(formatCalendarDate(data.weekEnd))}</p>
    ${isPreview ? '<p class="watermark">PREVIEW — NOT YET SUBMITTED</p>' : ""}
  </header>

  <dl class="meta">
    <dt>Student</dt><dd>${escapeHtml(data.student.email)}</dd>
    <dt>Student number</dt><dd>${escapeHtml(data.student.studentNumber)}</dd>
    <dt>Program</dt><dd>${escapeHtml(data.student.program)}</dd>
    <dt>Position</dt><dd>${escapeHtml(data.student.positionTitle)}</dd>
    <dt>Host company</dt><dd>${escapeHtml(data.company?.name)}</dd>
    <dt>Supervisor</dt><dd>${escapeHtml(data.company?.supervisorName)}</dd>
    <dt>Due date</dt><dd>${escapeHtml(formatCalendarDate(data.dueDate))}</dd>
    <dt>Reference code</dt><dd>${isPreview ? "Issued on submission" : escapeHtml(data.referenceCode)}</dd>
  </dl>

  <table>
    <thead><tr><th>Date</th><th>Hours</th><th>Accomplishments</th><th>Tools used</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <dl class="totals">
    <div><dt>Total this week</dt><dd>${escapeHtml(data.totals.totalHours)} hrs</dd></div>
    <div><dt>Running total</dt><dd>${escapeHtml(data.totals.runningTotal)} hrs</dd></div>
    <div><dt>Remaining</dt><dd>${escapeHtml(data.totals.remainingHours)} / ${escapeHtml(data.student.requiredHours)} hrs</dd></div>
  </dl>

  ${
    data.reasonForDelay
      ? `<p><strong>Reason for late submission:</strong> ${escapeHtml(data.reasonForDelay)}</p>`
      : ""
  }

  <section class="signatures">
    <div>Student signature</div>
    <div>Company supervisor signature</div>
  </section>

  <footer>
    ${
      isPreview
        ? "Preview generated by IDSMS-CIS"
        : `${escapeHtml(data.referenceCode)} · submitted ${escapeHtml(formatInstant(data.submittedAt!))} · IDSMS-CIS`
    }
  </footer>
</body>
</html>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/documents/weeklyReportTemplate.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents
git commit -m "Add escaped HTML template for weekly report documents"
```

---

### Task 3: Weekly report document data loader

**Files:**

- Create: `src/lib/documents/weeklyReportData.ts`
- Test: `src/lib/documents/weeklyReportData.test.ts`

**Interfaces:**

- Consumes: `WeeklyReportDocumentData` (Task 2); `getLatestSubmission` from `@/lib/services/weeklyReportService`; `getWeeklyReportDueDate` from `@/lib/utils/reportDeadline`.
- Produces: `loadWeeklyReportDocumentData(weeklyReportId: string): Promise<WeeklyReportDocumentData | null>` (null if the report doesn't exist).

- [ ] **Step 1: Write the failing tests**

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";

beforeEach(() => resetPrismaMock());

const row = {
  id: "wr-1",
  studentProfileId: "p-1",
  weekStart: new Date("2026-10-05T00:00:00Z"),
  weekEnd: new Date("2026-10-11T00:00:00Z"),
  totalHours: 8,
  runningTotal: 48,
  remainingHours: 552,
  revisionHistory: [
    {
      type: "SUBMITTED",
      timestamp: "2026-10-12T02:00:00.000Z",
      referenceCode: "WR-20261005-ABCD1234",
      late: false,
      reasonForDelay: null,
      submittedBy: "u-1",
    },
  ],
  dailyEntries: [
    {
      reportDate: new Date("2026-10-05T00:00:00Z"),
      actualHours: 8,
      accomplishments: "Built the login page",
      toolsUsed: null,
    },
  ],
  studentProfile: {
    studentNumber: "2026-00123-MN-0",
    program: "BSIT",
    positionTitle: null,
    requiredHours: 600,
    user: { email: "student.test@idsms.local" },
    company: null,
  },
};

describe("loadWeeklyReportDocumentData", () => {
  it("maps a submitted report into template data with the latest reference code", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(row as never);

    const data = await loadWeeklyReportDocumentData("wr-1");

    expect(data).toEqual(
      expect.objectContaining({
        weeklyReportId: "wr-1",
        studentProfileId: "p-1",
        referenceCode: "WR-20261005-ABCD1234",
        submittedAt: new Date("2026-10-12T02:00:00.000Z"),
        dueDate: new Date("2026-10-13T00:00:00Z"),
        company: null,
        totals: { totalHours: 8, runningTotal: 48, remainingHours: 552 },
      })
    );
    expect(data!.entries[0]).toEqual(expect.objectContaining({ actualHours: 8 }));
  });

  it("returns referenceCode null for a draft (never submitted)", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue({ ...row, revisionHistory: [] } as never);
    const data = await loadWeeklyReportDocumentData("wr-1");
    expect(data!.referenceCode).toBeNull();
    expect(data!.submittedAt).toBeNull();
  });

  it("returns null for an unknown report", async () => {
    prismaMock.weeklyReport.findUnique.mockResolvedValue(null);
    await expect(loadWeeklyReportDocumentData("missing")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/documents/weeklyReportData.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement**

```ts
import { prisma } from "@/lib/prisma";
import { getLatestSubmission } from "@/lib/services/weeklyReportService";
import { getWeeklyReportDueDate } from "@/lib/utils/reportDeadline";
import type { WeeklyReportDocumentData } from "@/lib/documents/weeklyReportTemplate";

// Single read path for everything the weekly report document shows — used
// by both the preview page and server PDF generation so they can't drift.
export async function loadWeeklyReportDocumentData(
  weeklyReportId: string
): Promise<WeeklyReportDocumentData | null> {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    select: {
      id: true,
      studentProfileId: true,
      weekStart: true,
      weekEnd: true,
      totalHours: true,
      runningTotal: true,
      remainingHours: true,
      revisionHistory: true,
      dailyEntries: {
        orderBy: { reportDate: "asc" },
        select: { reportDate: true, actualHours: true, accomplishments: true, toolsUsed: true },
      },
      studentProfile: {
        select: {
          studentNumber: true,
          program: true,
          positionTitle: true,
          requiredHours: true,
          user: { select: { email: true } },
          company: { select: { name: true, supervisorName: true } },
        },
      },
    },
  });
  if (!report) return null;

  const submission = getLatestSubmission(report.revisionHistory);
  const profile = report.studentProfile;

  return {
    weeklyReportId: report.id,
    studentProfileId: report.studentProfileId,
    referenceCode: submission?.referenceCode ?? null,
    submittedAt: submission ? new Date(submission.timestamp) : null,
    reasonForDelay: submission?.reasonForDelay ?? null,
    weekStart: report.weekStart,
    weekEnd: report.weekEnd,
    dueDate: getWeeklyReportDueDate(report.weekEnd),
    student: {
      email: profile.user.email,
      studentNumber: profile.studentNumber,
      program: profile.program,
      positionTitle: profile.positionTitle,
      requiredHours: profile.requiredHours,
    },
    company: profile.company,
    entries: report.dailyEntries.map((e) => ({
      reportDate: e.reportDate,
      actualHours: e.actualHours == null ? null : Number(e.actualHours),
      accomplishments: e.accomplishments,
      toolsUsed: e.toolsUsed,
    })),
    totals: {
      totalHours: Number(report.totalHours),
      runningTotal: Number(report.runningTotal),
      remainingHours: Number(report.remainingHours),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/documents/weeklyReportData.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/weeklyReportData.ts src/lib/documents/weeklyReportData.test.ts
git commit -m "Load weekly report document data from one shared query"
```

---

### Task 4: Headless Chrome HTML→PDF renderer

**Files:**

- Create: `src/lib/pdf/renderHtmlToPdf.ts`
- Test: `src/lib/pdf/renderHtmlToPdf.test.ts`
- Modify: `next.config.mjs`, `.env.example`

**Interfaces:**

- Produces: `resolveBrowserLaunch(): Promise<{ executablePath: string; args: string[] }>`; `renderHtmlToPdf(html: string, timeoutMs?: number): Promise<Buffer>`.

- [ ] **Step 1: Write the failing tests**

```ts
// Both browser packages are mocked with factories so Jest never loads the
// real ESM builds or a Chrome binary.
jest.mock("puppeteer-core", () => ({ __esModule: true, default: { launch: jest.fn() } }));
jest.mock("@sparticuz/chromium", () => ({
  __esModule: true,
  default: { args: ["--no-sandbox"], executablePath: jest.fn() },
}));

import puppeteer from "puppeteer-core";
import Chromium from "@sparticuz/chromium";
import { renderHtmlToPdf, resolveBrowserLaunch } from "@/lib/pdf/renderHtmlToPdf";

const launch = puppeteer.launch as jest.Mock;
const chromiumPath = Chromium.executablePath as jest.Mock;

function fakeBrowser(pdfBytes = new Uint8Array([37, 80, 68, 70])) {
  const page = {
    setContent: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(pdfBytes),
  };
  const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
  return { browser, page };
}

const ORIGINAL_ENV = process.env.PUPPETEER_EXECUTABLE_PATH;
afterEach(() => {
  process.env.PUPPETEER_EXECUTABLE_PATH = ORIGINAL_ENV;
  jest.clearAllMocks();
});

describe("resolveBrowserLaunch", () => {
  it("prefers a local browser from PUPPETEER_EXECUTABLE_PATH", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "C:/Chrome/chrome.exe";
    await expect(resolveBrowserLaunch()).resolves.toEqual({
      executablePath: "C:/Chrome/chrome.exe",
      args: [],
    });
    expect(chromiumPath).not.toHaveBeenCalled();
  });

  it("falls back to @sparticuz/chromium (Vercel/Linux)", async () => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    chromiumPath.mockResolvedValue("/tmp/chromium");
    await expect(resolveBrowserLaunch()).resolves.toEqual({
      executablePath: "/tmp/chromium",
      args: ["--no-sandbox"],
    });
  });
});

describe("renderHtmlToPdf", () => {
  it("prints the HTML to an A4 PDF buffer and always closes the browser", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "chrome";
    const { browser, page } = fakeBrowser();
    launch.mockResolvedValue(browser);

    const pdf = await renderHtmlToPdf("<p>hi</p>");

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(page.setContent).toHaveBeenCalledWith(
      "<p>hi</p>",
      expect.objectContaining({ waitUntil: "load" })
    );
    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: "A4", printBackground: true })
    );
    expect(browser.close).toHaveBeenCalled();
  });

  it("closes the browser even when printing throws", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "chrome";
    const { browser, page } = fakeBrowser();
    page.pdf.mockRejectedValue(new Error("Target closed"));
    launch.mockResolvedValue(browser);

    await expect(renderHtmlToPdf("<p>hi</p>")).rejects.toThrow("Target closed");
    expect(browser.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/pdf/renderHtmlToPdf.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement**

`src/lib/pdf/renderHtmlToPdf.ts`:

```ts
import puppeteer from "puppeteer-core";
import Chromium from "@sparticuz/chromium";

// FR-DG-06: server-side Puppeteer rendering. On Vercel/Linux the browser is
// @sparticuz/chromium's bundled build; on a developer machine (Windows/macOS)
// set PUPPETEER_EXECUTABLE_PATH to a local Chrome or Edge, since the
// bundled binary is Linux-only.
export async function resolveBrowserLaunch(): Promise<{ executablePath: string; args: string[] }> {
  const local = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (local) {
    return { executablePath: local, args: [] };
  }
  return { executablePath: await Chromium.executablePath(), args: Chromium.args };
}

export async function renderHtmlToPdf(html: string, timeoutMs = 30_000): Promise<Buffer> {
  const { executablePath, args } = await resolveBrowserLaunch();
  const browser = await puppeteer.launch({ executablePath, args, headless: true });
  try {
    const page = await browser.newPage();
    // setContent, not goto — the HTML is already rendered server-side, so no
    // session cookies ever need to be handed to the headless browser.
    await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
    const pdf = await page.pdf({ format: "A4", printBackground: true, timeout: timeoutMs });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

In `next.config.mjs`, inside the exported config, add (merge with any existing `experimental` key):

```js
  experimental: {
    // Next 14: keep the headless-browser packages as runtime requires so
    // webpack doesn't try to bundle Chromium's binary/ESM internals.
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  },
```

Append to `.env.example`:

```bash
# Module 8 PDF generation — local dev only. Leave unset on Vercel/Linux, where
# @sparticuz/chromium supplies the browser. Windows examples:
#   C:\Program Files\Google\Chrome\Application\chrome.exe
#   C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
PUPPETEER_EXECUTABLE_PATH=
```

- [ ] **Step 4: Run tests and build**

Run: `npx jest src/lib/pdf && npx tsc --noEmit && npx next build`
Expected: tests PASS (4), tsc clean, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf next.config.mjs .env.example
git commit -m "Add Puppeteer HTML-to-PDF renderer with local and serverless Chrome"
```

---

### Task 5: Document service with retry, GENERATED/FAILED lifecycle (weekly)

**Files:**

- Replace: `src/lib/services/documentService.ts` (currently a two-line comment)
- Test: `src/lib/services/documentService.test.ts`

**Interfaces:**

- Consumes: `loadWeeklyReportDocumentData` (Task 3), `renderWeeklyReportHtml` (Task 2), `renderHtmlToPdf` (Task 4), `uploadPdfBuffer`/`GENERATED_DOCUMENTS_BUCKET`/`getSignedUrl` (Task 1 + existing), `logEvent`.
- Produces:
  - `class DocumentNotReadyError extends Error`
  - `withRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<T>`
  - `weeklyPeriodLabel(weekStart: Date): string` → `"2026-10-05"`
  - `generateWeeklyReportPdf(weeklyReportId: string, actingUserId: string, opts?: { sleep?: (ms: number) => Promise<void> }): Promise<{ generatedDocumentId: string; status: DocumentStatus }>`
  - `getWeeklyReportDocument(weeklyReportId: string): Promise<GeneratedDocument | null>`
  - `getGeneratedDocumentDownloadUrl(doc: GeneratedDocument): Promise<string>`

- [ ] **Step 1: Write the failing tests**

```ts
import { DocumentStatus, DocumentType } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/documents/weeklyReportData", () => ({ loadWeeklyReportDocumentData: jest.fn() }));
jest.mock("@/lib/pdf/renderHtmlToPdf", () => ({ renderHtmlToPdf: jest.fn() }));
jest.mock("@/lib/storage", () => ({
  GENERATED_DOCUMENTS_BUCKET: "generated-documents",
  uploadPdfBuffer: jest.fn(),
  getSignedUrl: jest.fn(),
}));

import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import { uploadPdfBuffer } from "@/lib/storage";
import {
  DocumentNotReadyError,
  generateWeeklyReportPdf,
  weeklyPeriodLabel,
  withRetry,
} from "@/lib/services/documentService";

const loadData = loadWeeklyReportDocumentData as jest.Mock;
const render = renderHtmlToPdf as jest.Mock;
const upload = uploadPdfBuffer as jest.Mock;
const noSleep = jest.fn().mockResolvedValue(undefined);

const submitted = {
  weeklyReportId: "wr-1",
  studentProfileId: "p-1",
  referenceCode: "WR-20261005-ABCD1234",
  submittedAt: new Date("2026-10-12T02:00:00Z"),
  reasonForDelay: null,
  weekStart: new Date("2026-10-05T00:00:00Z"),
  weekEnd: new Date("2026-10-11T00:00:00Z"),
  dueDate: new Date("2026-10-13T00:00:00Z"),
  student: {
    email: "s@x",
    studentNumber: "1",
    program: "BSIT",
    positionTitle: null,
    requiredHours: 600,
  },
  company: null,
  entries: [],
  totals: { totalHours: 0, runningTotal: 0, remainingHours: 600 },
};

beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("withRetry", () => {
  it("retries up to 3 times with 1s/2s/4s backoff, then rethrows", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("boom"));
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(4);
    expect(noSleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
  });

  it("returns as soon as an attempt succeeds", async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error("cold start")).mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("generateWeeklyReportPdf", () => {
  it("refuses a report that has not been submitted (FR-DG-05)", async () => {
    loadData.mockResolvedValue({ ...submitted, referenceCode: null, submittedAt: null });
    await expect(generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep })).rejects.toThrow(
      DocumentNotReadyError
    );
    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
  });

  it("creates the row, renders, uploads, and marks GENERATED", async () => {
    loadData.mockResolvedValue(submitted);
    prismaMock.generatedDocument.findFirst.mockResolvedValue(null);
    prismaMock.generatedDocument.create.mockResolvedValue({ id: "doc-1" } as never);
    render.mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("weekly/p-1/wr-1.pdf");

    const result = await generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep });

    expect(result).toEqual({ generatedDocumentId: "doc-1", status: DocumentStatus.GENERATED });
    expect(prismaMock.generatedDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentProfileId: "p-1",
        documentType: DocumentType.WEEKLY_REPORT,
        periodLabel: "2026-10-05",
        referenceCode: "WR-20261005-ABCD1234",
        status: DocumentStatus.PENDING_DRAFT,
      }),
    });
    expect(upload).toHaveBeenCalledWith(
      "generated-documents",
      "weekly/p-1/wr-1.pdf",
      expect.any(Buffer)
    );
    expect(prismaMock.generatedDocument.update).toHaveBeenLastCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({
        status: DocumentStatus.GENERATED,
        fileUrl: "weekly/p-1/wr-1.pdf",
        generatedAt: expect.any(Date),
      }),
    });
  });

  it("reuses the existing row for the same week and updates its reference code", async () => {
    loadData.mockResolvedValue({ ...submitted, referenceCode: "WR-20261005-NEWCODE1" });
    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: "doc-1" } as never);
    render.mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("weekly/p-1/wr-1.pdf");

    await generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep });

    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
    expect(prismaMock.generatedDocument.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({
        referenceCode: "WR-20261005-NEWCODE1",
        status: DocumentStatus.PENDING_DRAFT,
      }),
    });
  });

  it("marks FAILED after 4 attempts, logs, and does not throw (FR-DG-07)", async () => {
    loadData.mockResolvedValue(submitted);
    prismaMock.generatedDocument.findFirst.mockResolvedValue(null);
    prismaMock.generatedDocument.create.mockResolvedValue({ id: "doc-1" } as never);
    render.mockRejectedValue(new Error("Failed to launch the browser process"));

    const result = await generateWeeklyReportPdf("wr-1", "u-1", { sleep: noSleep });

    expect(result).toEqual({ generatedDocumentId: "doc-1", status: DocumentStatus.FAILED });
    expect(render).toHaveBeenCalledTimes(4);
    expect(prismaMock.generatedDocument.update).toHaveBeenLastCalledWith({
      where: { id: "doc-1" },
      data: { status: DocumentStatus.FAILED },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DOCUMENT_GENERATION_FAILED" }),
      })
    );
    expect(console.error).toHaveBeenCalled();
  });
});

describe("weeklyPeriodLabel", () => {
  it("is the YYYY-MM-DD week start", () => {
    expect(weeklyPeriodLabel(new Date("2026-10-05T00:00:00Z"))).toBe("2026-10-05");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/services/documentService.test.ts`
Expected: FAIL. `withRetry` etc. not exported.

- [ ] **Step 3: Implement** (replace the whole of `src/lib/services/documentService.ts`)

```ts
// Server-side PDF generation via Puppeteer, with failure recovery/retry logic.
// See PRD Module 8 (FR-DG-*), especially FR-DG-07 (retry with exponential backoff).
import { DocumentStatus, DocumentType, type GeneratedDocument } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";
import { renderWeeklyReportHtml } from "@/lib/documents/weeklyReportTemplate";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import { GENERATED_DOCUMENTS_BUCKET, getSignedUrl, uploadPdfBuffer } from "@/lib/storage";
import { toDateKey } from "@/lib/utils/reportDeadline";

// FR-DG-05: a document is only generated for content the student confirmed.
export class DocumentNotReadyError extends Error {
  constructor(message = "Submit the report before generating its PDF") {
    super(message);
    this.name = "DocumentNotReadyError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// FR-DG-07: "a maximum of 3 retries with exponential backoff" — one attempt
// plus up to 3 retries, waiting 1s, 2s, 4s between them.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<T> {
  const { retries = 3, baseDelayMs = 1000, sleep = defaultSleep } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

export function weeklyPeriodLabel(weekStart: Date): string {
  return toDateKey(weekStart);
}

// One row per (student, WEEKLY_REPORT, week): a resubmission after Return
// updates the same row's referenceCode instead of adding a second row, which
// keeps referenceCode @unique satisfied and the Storage object overwritten
// in place (R11).
export async function generateWeeklyReportPdf(
  weeklyReportId: string,
  actingUserId: string,
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ generatedDocumentId: string; status: DocumentStatus }> {
  const data = await loadWeeklyReportDocumentData(weeklyReportId);
  if (!data || !data.referenceCode) {
    throw new DocumentNotReadyError();
  }

  const periodLabel = weeklyPeriodLabel(data.weekStart);
  const existing = await prisma.generatedDocument.findFirst({
    where: {
      studentProfileId: data.studentProfileId,
      documentType: DocumentType.WEEKLY_REPORT,
      periodLabel,
    },
    select: { id: true },
  });

  const pending = { referenceCode: data.referenceCode, status: DocumentStatus.PENDING_DRAFT };
  const documentId = existing
    ? (await prisma.generatedDocument.update({ where: { id: existing.id }, data: pending }),
      existing.id)
    : (
        await prisma.generatedDocument.create({
          data: {
            studentProfileId: data.studentProfileId,
            documentType: DocumentType.WEEKLY_REPORT,
            periodLabel,
            ...pending,
          },
        })
      ).id;

  const path = `weekly/${data.studentProfileId}/${weeklyReportId}.pdf`;
  try {
    await withRetry(
      async () => {
        const pdf = await renderHtmlToPdf(renderWeeklyReportHtml(data));
        await uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, path, pdf);
      },
      { sleep: opts.sleep }
    );
  } catch (error) {
    // FR-DG-07: keep the submission, log, mark failed, let the user regenerate.
    console.error("Weekly report PDF generation failed", { weeklyReportId, error });
    await prisma.generatedDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.FAILED },
    });
    await logEvent({
      userId: actingUserId,
      action: "DOCUMENT_GENERATION_FAILED",
      entityType: "GeneratedDocument",
      entityId: documentId,
      detail: { weeklyReportId, message: error instanceof Error ? error.message : String(error) },
    });
    return { generatedDocumentId: documentId, status: DocumentStatus.FAILED };
  }

  await prisma.generatedDocument.update({
    where: { id: documentId },
    data: { status: DocumentStatus.GENERATED, fileUrl: path, generatedAt: new Date() },
  });
  await logEvent({
    userId: actingUserId,
    action: "DOCUMENT_GENERATED",
    entityType: "GeneratedDocument",
    entityId: documentId,
    detail: { weeklyReportId, referenceCode: data.referenceCode },
  });
  return { generatedDocumentId: documentId, status: DocumentStatus.GENERATED };
}

export async function getWeeklyReportDocument(
  weeklyReportId: string
): Promise<GeneratedDocument | null> {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    select: { studentProfileId: true, weekStart: true },
  });
  if (!report) return null;
  return prisma.generatedDocument.findFirst({
    where: {
      studentProfileId: report.studentProfileId,
      documentType: DocumentType.WEEKLY_REPORT,
      periodLabel: weeklyPeriodLabel(report.weekStart),
    },
  });
}

export async function getGeneratedDocumentDownloadUrl(doc: GeneratedDocument): Promise<string> {
  if (doc.status !== DocumentStatus.GENERATED || !doc.fileUrl) {
    throw new DocumentNotReadyError("This PDF has not been generated yet");
  }
  return getSignedUrl(GENERATED_DOCUMENTS_BUCKET, doc.fileUrl);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/services/documentService.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/documentService.ts src/lib/services/documentService.test.ts
git commit -m "Generate weekly report PDFs with retry and failure status"
```

---

### Task 6: Weekly PDF API route (download + generate/regenerate)

**Files:**

- Create: `src/app/api/weekly-reports/[id]/pdf/route.ts`
- Modify: `src/lib/utils/apiError.ts`
- Test: `src/app/api/weekly-reports/[id]/pdf/route.test.ts`

**Interfaces:**

- Consumes: Task 5 exports; `getWeeklyReport` (weeklyReportService); `requireUserApi`; `assertCanAccessStudent`.
- Produces: `GET /api/weekly-reports/[id]/pdf` → 307 to a signed URL, or 404 `{ error, status }` if not generated. `POST /api/weekly-reports/[id]/pdf` → 200 `{ generatedDocumentId, status }` (status may be `"FAILED"`).

- [ ] **Step 1: Write the failing tests**

```ts
/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({ requireUserApi: jest.fn() }));
jest.mock("@/lib/services/userService", () => {
  class ForbiddenError extends Error {}
  return { ForbiddenError, assertCanAccessStudent: jest.fn() };
});
jest.mock("@/lib/services/weeklyReportService", () => ({ getWeeklyReport: jest.fn() }));
jest.mock("@/lib/services/documentService", () => {
  class DocumentNotReadyError extends Error {}
  return {
    DocumentNotReadyError,
    generateWeeklyReportPdf: jest.fn(),
    getWeeklyReportDocument: jest.fn(),
    getGeneratedDocumentDownloadUrl: jest.fn(),
  };
});
jest.mock("@/lib/utils/apiError", () => ({
  handleApiError: (error: Error) =>
    Response.json(
      { error: error.message },
      { status: error.constructor.name === "ForbiddenError" ? 403 : 400 }
    ),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { getWeeklyReport } from "@/lib/services/weeklyReportService";
import {
  generateWeeklyReportPdf,
  getGeneratedDocumentDownloadUrl,
  getWeeklyReportDocument,
} from "@/lib/services/documentService";
import { GET, POST } from "@/app/api/weekly-reports/[id]/pdf/route";

const params = { params: { id: "wr-1" } };
const req = (method: string) =>
  new NextRequest("http://localhost/api/weekly-reports/wr-1/pdf", { method });

beforeEach(() => {
  jest.clearAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({ id: "u-1", role: "STUDENT_INTERN" });
  (getWeeklyReport as jest.Mock).mockResolvedValue({ id: "wr-1", studentProfileId: "p-1" });
});

describe("POST /api/weekly-reports/[id]/pdf", () => {
  it("returns 200 with FAILED status instead of erroring when generation fails", async () => {
    (generateWeeklyReportPdf as jest.Mock).mockResolvedValue({
      generatedDocumentId: "doc-1",
      status: "FAILED",
    });
    const res = await POST(req("POST"), params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ generatedDocumentId: "doc-1", status: "FAILED" });
  });

  it("returns 404 for an unknown report", async () => {
    (getWeeklyReport as jest.Mock).mockResolvedValue(null);
    const res = await POST(req("POST"), params);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/weekly-reports/[id]/pdf", () => {
  it("redirects to a signed URL when the PDF is generated", async () => {
    (getWeeklyReportDocument as jest.Mock).mockResolvedValue({ id: "doc-1", status: "GENERATED" });
    (getGeneratedDocumentDownloadUrl as jest.Mock).mockResolvedValue(
      "https://signed.example/doc.pdf"
    );
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://signed.example/doc.pdf");
  });

  it("returns 404 with the current status when not generated", async () => {
    (getWeeklyReportDocument as jest.Mock).mockResolvedValue({ id: "doc-1", status: "FAILED" });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual(expect.objectContaining({ status: "FAILED" }));
  });

  it("GET refuses a user who cannot access the student", async () => {
    (assertCanAccessStudent as jest.Mock).mockRejectedValue(new ForbiddenError("Forbidden"));
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(403);
    expect(getGeneratedDocumentDownloadUrl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest "src/app/api/weekly-reports/\[id\]/pdf"`
Expected: FAIL. Route module not found.

- [ ] **Step 3: Implement**

`src/app/api/weekly-reports/[id]/pdf/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { getWeeklyReport } from "@/lib/services/weeklyReportService";
import {
  generateWeeklyReportPdf,
  getGeneratedDocumentDownloadUrl,
  getWeeklyReportDocument,
} from "@/lib/services/documentService";
import { handleApiError } from "@/lib/utils/apiError";

// Puppeteer needs the Node runtime and headroom for a cold Chrome start plus
// FR-DG-07's retries (1s+2s+4s backoff on top of each render attempt).
export const runtime = "nodejs";
export const maxDuration = 120;

async function loadAccessibleReport(id: string) {
  const user = await requireUserApi();
  const report = await getWeeklyReport(id);
  if (!report) return { user, report: null };
  await assertCanAccessStudent(user, report.studentProfileId);
  return { user, report };
}

// Download: redirect to a short-lived signed URL (private bucket).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { report } = await loadAccessibleReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const doc = await getWeeklyReportDocument(params.id);
    if (!doc || doc.status !== "GENERATED") {
      return NextResponse.json(
        { error: "PDF not generated yet", status: doc?.status ?? null },
        { status: 404 }
      );
    }
    return NextResponse.redirect(await getGeneratedDocumentDownloadUrl(doc));
  } catch (error) {
    return handleApiError(error);
  }
}

// Generate or regenerate. Called by the student's form right after a
// successful submit, and by the "Regenerate PDF" button (FR-DG-07). Anyone
// who can access the student may trigger it; generation itself refuses
// unsubmitted reports (FR-DG-05). A FAILED result is a normal 200 response —
// the submission is intact and the UI offers Regenerate.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, report } = await loadAccessibleReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await generateWeeklyReportPdf(params.id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

In `src/lib/utils/apiError.ts`: add `import { DocumentNotReadyError } from "@/lib/services/documentService";` and append `DocumentNotReadyError` to the `BAD_REQUEST_ERRORS` array.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest "src/app/api/weekly-reports/\[id\]/pdf" && npx tsc --noEmit`
Expected: PASS (5 tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/weekly-reports/[id]/pdf" src/lib/utils/apiError.ts
git commit -m "Add weekly report PDF download and regenerate route"
```

---

### Task 7: Weekly UI — auto-generate after submit, Download/Regenerate, shared preview

**Files:**

- Create: `src/app/(dashboard)/students/[studentProfileId]/weekly-reports/report-pdf-actions.tsx`
- Modify: `…/weekly-reports/weekly-report-form.tsx` (`onSubmit`), `…/weekly-reports/page.tsx`, `…/[weeklyReportId]/preview/page.tsx`, `…/[weeklyReportId]/preview/print-button.tsx`

**Interfaces:**

- Consumes: Task 6 routes; `loadWeeklyReportDocumentData` + `renderWeeklyReportHtml`.
- Produces: `ReportPdfActions({ endpoint: string; status: "GENERATED" | "FAILED" | "PENDING_DRAFT" | null; canGenerate: boolean })`, reused by the monthly UI in Task 8.

- [ ] **Step 1: Write the failing component test** (`report-pdf-actions.test.tsx`)

```tsx
/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { ReportPdfActions } from "./report-pdf-actions";

beforeEach(() => {
  refresh.mockClear();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: "GENERATED" }),
  }) as jest.Mock;
});

it("links to the download route when the PDF is generated", () => {
  render(
    <ReportPdfActions endpoint="/api/weekly-reports/wr-1/pdf" status="GENERATED" canGenerate />
  );
  expect(screen.getByRole("link", { name: /download pdf/i })).toHaveAttribute(
    "href",
    "/api/weekly-reports/wr-1/pdf"
  );
});

it("offers Regenerate after a failure and POSTs to the endpoint", async () => {
  render(<ReportPdfActions endpoint="/api/weekly-reports/wr-1/pdf" status="FAILED" canGenerate />);
  await userEvent.click(screen.getByRole("button", { name: /regenerate pdf/i }));
  expect(global.fetch).toHaveBeenCalledWith("/api/weekly-reports/wr-1/pdf", { method: "POST" });
  expect(refresh).toHaveBeenCalled();
});

it("shows nothing actionable to a viewer who cannot generate and has no PDF", () => {
  const { container } = render(
    <ReportPdfActions endpoint="/api/weekly-reports/wr-1/pdf" status={null} canGenerate={false} />
  );
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest report-pdf-actions`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement**

`report-pdf-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileDown, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfStatus = "GENERATED" | "FAILED" | "PENDING_DRAFT" | null;

// FR-DG-07 UI: Download when ready, Generate/Regenerate otherwise. `endpoint`
// is the document's /pdf route (GET downloads, POST generates), so the same
// component serves weekly and monthly reports.
export function ReportPdfActions({
  endpoint,
  status,
  canGenerate,
}: {
  endpoint: string;
  status: PdfStatus;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function generate() {
    setIsPending(true);
    const res = await fetch(endpoint, { method: "POST" });
    setIsPending(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Could not generate the PDF");
    } else if (body.status === "FAILED") {
      toast.error("PDF generation failed after 3 retries — try Regenerate again shortly");
    } else {
      toast.success("PDF ready");
    }
    router.refresh();
  }

  if (status === "GENERATED") {
    return (
      <a
        href={endpoint}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer gap-1.5")}
      >
        <FileDown className="size-3.5" aria-hidden="true" />
        Download PDF
      </a>
    );
  }

  if (!canGenerate) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={generate}
      className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
    >
      <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} aria-hidden="true" />
      {isPending ? "Generating..." : status === "FAILED" ? "Regenerate PDF" : "Generate PDF"}
    </Button>
  );
}
```

In `weekly-report-form.tsx` `onSubmit`, after the successful submit `toast.success(...)` and **before** `router.refresh()`, add a fire-and-forget generation call. Submission is already saved, so a PDF failure must not surface as a submit failure:

```tsx
// Module 8: render the signed-copy PDF in the background. Failures are
// recorded server-side as FAILED and offered as "Regenerate PDF".
void fetch(`/api/weekly-reports/${weeklyReportId}/pdf`, { method: "POST" }).finally(() =>
  router.refresh()
);
```

In `weekly-reports/page.tsx`:

1. After loading `reports`, load their documents in one query:

```tsx
const documents = await prisma.generatedDocument.findMany({
  where: { studentProfileId: params.studentProfileId, documentType: "WEEKLY_REPORT" },
  select: { periodLabel: true, status: true },
});
const pdfStatusByWeek = new Map(documents.map((d) => [d.periodLabel, d.status]));
```

2. Import `ReportPdfActions` and `toDateKey` (from `@/lib/utils/reportDeadline`). Inside each report card's header actions `<div className="flex flex-wrap items-center gap-2">`, after the status badges, render it only for submitted reports:

```tsx
{
  submission && (
    <ReportPdfActions
      endpoint={`/api/weekly-reports/${report.id}/pdf`}
      status={pdfStatusByWeek.get(toDateKey(report.weekStart)) ?? null}
      canGenerate
    />
  );
}
```

In `[weeklyReportId]/preview/page.tsx`, replace the hand-built `<article>…</article>` markup and its local `formatDate` helper with the shared template. Keep the existing access check, then:

```tsx
const data = await loadWeeklyReportDocumentData(params.weeklyReportId);
if (!data || data.studentProfileId !== params.studentProfileId) {
  notFound();
}
const html = renderWeeklyReportHtml(data);

return (
  <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        This is exactly what the generated PDF will contain.
      </p>
      <PrintButton frameId="report-preview" />
    </div>
    <iframe
      id="report-preview"
      title="Weekly report preview"
      srcDoc={html}
      sandbox="allow-same-origin allow-modals"
      className="h-[1100px] w-full rounded-lg border bg-white"
    />
  </div>
);
```

(Remove the now-unused imports: `prisma`, `getLatestSubmission`, `getWeeklyReportDueDate`. `sandbox` without `allow-scripts` means even a hypothetical escaping bug can't run script in the preview. `allow-same-origin` lets the print button reach `contentWindow`, and `allow-modals` lets the frame open its print dialog.)

Replace `print-button.tsx`:

```tsx
"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Prints only the report iframe, not the dashboard around it.
export function PrintButton({ frameId }: { frameId: string }) {
  function print() {
    const frame = document.getElementById(frameId) as HTMLIFrameElement | null;
    frame?.contentWindow?.print();
  }
  return (
    <Button onClick={print} className="cursor-pointer gap-1.5">
      <Printer className="size-4" aria-hidden="true" />
      Print / Save as PDF
    </Button>
  );
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx jest && npx tsc --noEmit && npx next lint`
Expected: all PASS / clean.

- [ ] **Step 5: Manual check (dev DB, local Chrome)**

Run in PowerShell:

```powershell
$env:PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"; npm run dev
```

Do these steps in order:

1. Apply `004_generated_documents_bucket.sql` in the Supabase SQL editor (once).
2. Log in as `student.test@idsms.local` and submit a week. "Download PDF" should appear within ~10 s.
3. Open it: the PDF shows the reference code, the Manila timestamp, and both signature lines.
4. Rename the Chrome path to a bogus value and regenerate. The row goes FAILED and "Regenerate PDF" appears.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/students/[studentProfileId]/weekly-reports"
git commit -m "Wire weekly report PDF generation and shared preview into the UI"
```

---

### Task 8: Monthly report PDF (template, generation, route, UI)

**Files:**

- Create: `src/lib/documents/monthlyReportTemplate.ts`, `src/lib/documents/monthlyReportData.ts`, `src/app/api/monthly-reports/[id]/pdf/route.ts`
- Modify: `src/lib/services/documentService.ts` (append), `…/monthly-reports/page.tsx`, `…/monthly-reports/monthly-report-view.tsx`
- Test: `src/lib/documents/monthlyReportTemplate.test.ts`, append to `src/lib/services/documentService.test.ts`

**Interfaces:**

- Consumes: `escapeHtml`, `formatCalendarDate`, `formatInstant`, `PRINT_CSS` (Task 2); `withRetry`, `DocumentNotReadyError` (Task 5); `ReportPdfActions` (Task 7).
- Produces:
  - `interface MonthlyReportDocumentData { generatedDocumentId; studentProfileId; calendarMonth: string; referenceCode: string; generatedAt: Date; student: WeeklyReportDocumentData["student"]; company: WeeklyReportDocumentData["company"]; weeks: { weekStart: Date; weekEnd: Date; status: string; totalHours: number }[]; approvedHours: number }`
  - `renderMonthlyReportHtml(data): string`
  - `loadMonthlyReportDocumentData(generatedDocumentId: string, referenceCode: string): Promise<MonthlyReportDocumentData | null>`
  - `generateMonthlyReportReferenceCode(calendarMonth: string): string` → `MR-202609-XXXXXXXX`
  - `generateMonthlyReportPdf(generatedDocumentId: string, actingUserId: string, opts?): Promise<{ generatedDocumentId: string; status: DocumentStatus }>`
  - `GET/POST /api/monthly-reports/[id]/pdf` (`id` = the MONTHLY_REPORT `generated_documents` row).

- [ ] **Step 1: Write the failing tests**

`src/lib/documents/monthlyReportTemplate.test.ts`:

```ts
import { renderMonthlyReportHtml } from "@/lib/documents/monthlyReportTemplate";

const data = {
  generatedDocumentId: "doc-m",
  studentProfileId: "p-1",
  calendarMonth: "2026-09",
  referenceCode: "MR-202609-ABCD1234",
  generatedAt: new Date("2026-10-11T02:00:00Z"),
  student: {
    email: "s@x",
    studentNumber: "1",
    program: "BSIT",
    positionTitle: null,
    requiredHours: 600,
  },
  company: { name: "Acme <Corp>", supervisorName: "J" },
  weeks: [
    {
      weekStart: new Date("2026-09-28T00:00:00Z"),
      weekEnd: new Date("2026-10-04T00:00:00Z"),
      status: "APPROVED",
      totalHours: 40,
    },
  ],
  approvedHours: 40,
};

it("renders the month, reference code, weeks, approved hours, and signatures", () => {
  const html = renderMonthlyReportHtml(data);
  expect(html).toContain("September 2026");
  expect(html).toContain("MR-202609-ABCD1234");
  expect(html).toContain("40 hrs");
  expect(html).toContain("Company supervisor signature");
});

it("escapes interpolated text", () => {
  expect(renderMonthlyReportHtml(data)).toContain("Acme &lt;Corp&gt;");
});
```

Append to `documentService.test.ts` (add `jest.mock("@/lib/documents/monthlyReportData", () => ({ loadMonthlyReportDocumentData: jest.fn() }));` beside the other mocks; import `loadMonthlyReportDocumentData`, `generateMonthlyReportPdf`, `generateMonthlyReportReferenceCode`):

```ts
describe("generateMonthlyReportPdf", () => {
  const loadMonthly = loadMonthlyReportDocumentData as jest.Mock;

  it("refuses a row that is not a MONTHLY_REPORT", async () => {
    prismaMock.generatedDocument.findUnique.mockResolvedValue({
      id: "doc-w",
      documentType: DocumentType.WEEKLY_REPORT,
    } as never);
    await expect(generateMonthlyReportPdf("doc-w", "u-1", { sleep: noSleep })).rejects.toThrow(
      DocumentNotReadyError
    );
  });

  it("assigns a reference code once, then renders and marks GENERATED", async () => {
    prismaMock.generatedDocument.findUnique.mockResolvedValue({
      id: "doc-m",
      documentType: DocumentType.MONTHLY_REPORT,
      periodLabel: "2026-09",
      referenceCode: null,
      studentProfileId: "p-1",
    } as never);
    loadMonthly.mockResolvedValue({ calendarMonth: "2026-09", studentProfileId: "p-1" });
    render.mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("monthly/p-1/2026-09.pdf");

    const result = await generateMonthlyReportPdf("doc-m", "u-1", { sleep: noSleep });

    expect(result.status).toBe(DocumentStatus.GENERATED);
    expect(loadMonthly).toHaveBeenCalledWith(
      "doc-m",
      expect.stringMatching(/^MR-202609-[0-9A-F]{8}$/)
    );
    expect(upload).toHaveBeenCalledWith(
      "generated-documents",
      "monthly/p-1/2026-09.pdf",
      expect.any(Buffer)
    );
  });
});

describe("generateMonthlyReportReferenceCode", () => {
  it("is MR-<YYYYMM>-<8 hex>", () => {
    expect(generateMonthlyReportReferenceCode("2026-09")).toMatch(/^MR-202609-[0-9A-F]{8}$/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest monthlyReportTemplate documentService`
Expected: FAIL. Modules/exports missing.

- [ ] **Step 3: Implement**

`src/lib/documents/monthlyReportTemplate.ts`:

```ts
import { escapeHtml, formatCalendarDate, formatInstant, PRINT_CSS } from "@/lib/documents/html";
import type { WeeklyReportDocumentData } from "@/lib/documents/weeklyReportTemplate";

export interface MonthlyReportDocumentData {
  generatedDocumentId: string;
  studentProfileId: string;
  calendarMonth: string; // "YYYY-MM"
  referenceCode: string;
  generatedAt: Date;
  student: WeeklyReportDocumentData["student"];
  company: WeeklyReportDocumentData["company"];
  weeks: { weekStart: Date; weekEnd: Date; status: string; totalHours: number }[];
  approvedHours: number;
}

function monthTitle(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// FR-WR-08 / FR-DG-03 monthly rollup of the month's weekly reports.
export function renderMonthlyReportHtml(data: MonthlyReportDocumentData): string {
  const rows = data.weeks
    .map(
      (w) => `
      <tr>
        <td>${escapeHtml(formatCalendarDate(w.weekStart))} – ${escapeHtml(formatCalendarDate(w.weekEnd))}</td>
        <td>${escapeHtml(w.status)}</td>
        <td>${escapeHtml(w.totalHours)} hrs</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Monthly Internship Report ${escapeHtml(data.referenceCode)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <header>
    <p class="eyebrow">Saint Louis University · SAMCIS</p>
    <h1>Monthly Internship Report</h1>
    <p class="period">${escapeHtml(monthTitle(data.calendarMonth))}</p>
  </header>

  <dl class="meta">
    <dt>Student</dt><dd>${escapeHtml(data.student.email)}</dd>
    <dt>Student number</dt><dd>${escapeHtml(data.student.studentNumber)}</dd>
    <dt>Program</dt><dd>${escapeHtml(data.student.program)}</dd>
    <dt>Position</dt><dd>${escapeHtml(data.student.positionTitle)}</dd>
    <dt>Host company</dt><dd>${escapeHtml(data.company?.name)}</dd>
    <dt>Supervisor</dt><dd>${escapeHtml(data.company?.supervisorName)}</dd>
    <dt>Reference code</dt><dd>${escapeHtml(data.referenceCode)}</dd>
    <dt>Required hours</dt><dd>${escapeHtml(data.student.requiredHours)}</dd>
  </dl>

  <table>
    <thead><tr><th>Week</th><th>Status</th><th>Hours</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <dl class="totals">
    <div><dt>Approved hours this month</dt><dd>${escapeHtml(data.approvedHours)} hrs</dd></div>
  </dl>

  <section class="signatures">
    <div>Student signature</div>
    <div>Company supervisor signature</div>
  </section>

  <footer>${escapeHtml(data.referenceCode)} · generated ${escapeHtml(formatInstant(data.generatedAt))} · IDSMS-CIS</footer>
</body>
</html>`;
}
```

`src/lib/documents/monthlyReportData.ts`:

```ts
import { WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MonthlyReportDocumentData } from "@/lib/documents/monthlyReportTemplate";

// Same overlap rule as monthlyReportService.checkMonthlyAggregationEligibility:
// a week counts toward every calendar month it touches.
export async function loadMonthlyReportDocumentData(
  generatedDocumentId: string,
  referenceCode: string
): Promise<MonthlyReportDocumentData | null> {
  const doc = await prisma.generatedDocument.findUnique({
    where: { id: generatedDocumentId },
    select: {
      id: true,
      periodLabel: true,
      studentProfileId: true,
      studentProfile: {
        select: {
          studentNumber: true,
          program: true,
          positionTitle: true,
          requiredHours: true,
          user: { select: { email: true } },
          company: { select: { name: true, supervisorName: true } },
        },
      },
    },
  });
  if (!doc?.periodLabel) return null;

  const [year, month] = doc.periodLabel.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1) - 1);

  const weeks = await prisma.weeklyReport.findMany({
    where: {
      studentProfileId: doc.studentProfileId,
      weekStart: { lte: monthEnd },
      weekEnd: { gte: monthStart },
    },
    orderBy: { weekStart: "asc" },
    select: { weekStart: true, weekEnd: true, status: true, totalHours: true },
  });

  const approved = new Set<string>([WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED]);
  const profile = doc.studentProfile;

  return {
    generatedDocumentId: doc.id,
    studentProfileId: doc.studentProfileId,
    calendarMonth: doc.periodLabel,
    referenceCode,
    generatedAt: new Date(),
    student: {
      email: profile.user.email,
      studentNumber: profile.studentNumber,
      program: profile.program,
      positionTitle: profile.positionTitle,
      requiredHours: profile.requiredHours,
    },
    company: profile.company,
    weeks: weeks.map((w) => ({ ...w, totalHours: Number(w.totalHours) })),
    approvedHours:
      Math.round(
        weeks
          .filter((w) => approved.has(w.status))
          .reduce((sum, w) => sum + Number(w.totalHours), 0) * 100
      ) / 100,
  };
}
```

Append to `src/lib/services/documentService.ts` (add `import { randomUUID } from "crypto";`, `import { loadMonthlyReportDocumentData } from "@/lib/documents/monthlyReportData";`, `import { renderMonthlyReportHtml } from "@/lib/documents/monthlyReportTemplate";` at the top):

```ts
export function generateMonthlyReportReferenceCode(calendarMonth: string): string {
  const random = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `MR-${calendarMonth.replace("-", "")}-${random}`;
}

// The MONTHLY_REPORT row already exists (submitMonthlyReport, FR-WR-08), so
// FR-DG-05's "confirmed" condition is satisfied by its existence. The
// reference code is assigned on first generation and kept on regenerate.
export async function generateMonthlyReportPdf(
  generatedDocumentId: string,
  actingUserId: string,
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ generatedDocumentId: string; status: DocumentStatus }> {
  const doc = await prisma.generatedDocument.findUnique({ where: { id: generatedDocumentId } });
  if (!doc || doc.documentType !== DocumentType.MONTHLY_REPORT || !doc.periodLabel) {
    throw new DocumentNotReadyError("Submit the monthly report before generating its PDF");
  }

  const referenceCode = doc.referenceCode ?? generateMonthlyReportReferenceCode(doc.periodLabel);
  await prisma.generatedDocument.update({
    where: { id: doc.id },
    data: { referenceCode, status: DocumentStatus.PENDING_DRAFT },
  });

  const path = `monthly/${doc.studentProfileId}/${doc.periodLabel}.pdf`;
  try {
    await withRetry(
      async () => {
        const data = await loadMonthlyReportDocumentData(doc.id, referenceCode);
        if (!data) throw new DocumentNotReadyError();
        const pdf = await renderHtmlToPdf(renderMonthlyReportHtml(data));
        await uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, path, pdf);
      },
      { sleep: opts.sleep }
    );
  } catch (error) {
    console.error("Monthly report PDF generation failed", { generatedDocumentId, error });
    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { status: DocumentStatus.FAILED },
    });
    await logEvent({
      userId: actingUserId,
      action: "DOCUMENT_GENERATION_FAILED",
      entityType: "GeneratedDocument",
      entityId: doc.id,
      detail: { message: error instanceof Error ? error.message : String(error) },
    });
    return { generatedDocumentId: doc.id, status: DocumentStatus.FAILED };
  }

  await prisma.generatedDocument.update({
    where: { id: doc.id },
    data: { status: DocumentStatus.GENERATED, fileUrl: path, generatedAt: new Date() },
  });
  await logEvent({
    userId: actingUserId,
    action: "DOCUMENT_GENERATED",
    entityType: "GeneratedDocument",
    entityId: doc.id,
    detail: { referenceCode },
  });
  return { generatedDocumentId: doc.id, status: DocumentStatus.GENERATED };
}
```

`src/app/api/monthly-reports/[id]/pdf/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import {
  generateMonthlyReportPdf,
  getGeneratedDocumentDownloadUrl,
} from "@/lib/services/documentService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

async function loadAccessibleMonthlyDoc(id: string) {
  const user = await requireUserApi();
  const doc = await prisma.generatedDocument.findUnique({ where: { id } });
  if (!doc || doc.documentType !== DocumentType.MONTHLY_REPORT) return { user, doc: null };
  await assertCanAccessStudent(user, doc.studentProfileId);
  return { user, doc };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { doc } = await loadAccessibleMonthlyDoc(params.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (doc.status !== "GENERATED") {
      return NextResponse.json(
        { error: "PDF not generated yet", status: doc.status },
        { status: 404 }
      );
    }
    return NextResponse.redirect(await getGeneratedDocumentDownloadUrl(doc));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, doc } = await loadAccessibleMonthlyDoc(params.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await generateMonthlyReportPdf(doc.id, user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
```

UI, `monthly-reports/page.tsx`: change `submitted: submitted ? { id: submitted.id, status: submitted.status } : null` (unchanged shape). `submitted.status` is already the document status.

UI, `monthly-report-view.tsx`:

1. Import `ReportPdfActions` from `../weekly-reports/report-pdf-actions`.
2. In the `month.submitted ?` branch, after `<StatusBadge status={month.submitted.status} />`, add:

```tsx
<ReportPdfActions
  endpoint={`/api/monthly-reports/${month.submitted.id}/pdf`}
  status={month.submitted.status as "GENERATED" | "FAILED" | "PENDING_DRAFT"}
  canGenerate
/>
```

3. In `submit()`, after a successful POST, generate in the background:

```tsx
const body = await res.json();
void fetch(`/api/monthly-reports/${body.generatedDocumentId}/pdf`, { method: "POST" }).finally(() =>
  router.refresh()
);
```

(replacing the existing trailing `router.refresh()` in that success path).

- [ ] **Step 4: Run everything**

Run: `npx jest && npx tsc --noEmit && npx next lint && npx next build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents src/lib/services/documentService.ts src/lib/services/documentService.test.ts "src/app/api/monthly-reports" "src/app/(dashboard)/students/[studentProfileId]/monthly-reports"
git commit -m "Generate monthly report PDFs with reference codes and Regenerate"
```

---

## Self-review (completed)

- **Spec coverage:**
  - FR-DG-03: weekly and monthly are covered here; the endorsement letter and final cover page are Workstream E, which reuses Tasks 1–5.
  - FR-DG-04: reference code and timestamp in the template (Tasks 2 and 8).
  - FR-DG-05: `DocumentNotReadyError` (Tasks 5 and 8).
  - FR-DG-06: Puppeteer (Task 4).
  - FR-DG-07: retries, FAILED status, logging and Regenerate (Tasks 5–7).
  - FR-WR-09: preview now uses the same template (Task 7).
  - FR-WR-10: reference code on the PDF (Tasks 2 and 5).
- **Placeholder scan:** no TBDs. Every code step has code.
- **Type consistency:**
  - `WeeklyReportDocumentData` is defined in Task 2 and used in Tasks 3, 5 and 8.
  - `generateWeeklyReportPdf(id, actingUserId, opts)` is consistent across Tasks 5–6.
  - `ReportPdfActions({ endpoint, status, canGenerate })` is consistent across Tasks 7–8.
- **Review Focus:** all five lines map to named tests in Tasks 2, 5 and 6.
- **Deliberately out of scope:**
  - Signed-copy upload: gated on decision D2.
  - Bulk PDF exports with re-auth (NFR-SEC-05): Workstream E, risk R14.
  - Async queueing: the client fire-and-forget POST plus FAILED/Regenerate is enough at capstone scale. Revisit Vercel Queues only if R2 recurs under load.
