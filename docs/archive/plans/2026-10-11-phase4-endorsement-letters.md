# Endorsement Letter & Final Report Cover PDFs Implementation Plan (Phase 4 · Workstream E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**

- Coordinators and faculty generate a student's **endorsement letter** PDF once all 9 checklist items are approved (FR-CK-04, FR-DG-01).
- Faculty generate **bulk letters for a class group** after re-entering their password (FR-DG-02, NFR-SEC-05).
- Students generate a **final report cover page** once they reach the configured hour threshold (FR-DG-03, FR-FT-01).

**Architecture:** Builds on Workstream A's pipeline. Task 1 extracts A's render → upload → retry → GENERATED/FAILED sequence into one `renderAndStoreDocument()` helper, so all four document types share a single implementation. Each new document type is a pure HTML template, a data loader, and a thin service function.

**Tech Stack:** Same as Workstream A (puppeteer-core, @sparticuz/chromium, Supabase Storage `generated-documents` bucket, Prisma, Jest).

**Spec:**

- `PRD.md` FR-DG-01/02/03/04/07, FR-CK-04, FR-FT-01, NFR-SEC-05.
- `docs/superpowers/plans/2026-10-11-phase4-roadmap.md` (Workstream E; risk R14).
- **Prerequisites:** Workstream A merged (`documentService`, `src/lib/documents/html.ts`, `renderHtmlToPdf`, bucket 004), and Workstream B Task 1 merged (`StudentProfile.fullName`, `Company.supervisorPosition`).

## Decisions applied

- **D3 default (no official letterhead yet).** The letterhead is a text block ("Saint Louis University · School of Accountancy, Management, Computing and Information Studies · Baguio City") rendered by `renderLetterhead()`. When SLU's real letterhead arrives, only that function changes.
- **R14 interpretation (NFR-SEC-05):**
  - A **bulk** export re-authenticates. The faculty member re-enters their password, checked with the existing `verifyCredentials`.
  - A single letter generated from a student's page doesn't need re-auth. It's one document for one student, made from a page that's already behind authentication. Record this interpretation in the PR description.
- **Final cover threshold (FR-FT-01):** a SystemConfig key `final_report_threshold:{program}`. Defaults are 500 for BSIT (the PRD's own example), and 5/6 of required hours, rounded up, for other programs. Admins can override it like required hours.

## Global Constraints

- FR-CK-04: generation is **blocked** unless `isEndorsementGateSatisfied(studentProfileId)` is true. Throw the existing `ChecklistGateError` (already mapped to 400).
- FR-DG-01 fields: student name, student ID, company name and address, supervisor name and position, endorsement date. A missing `fullName` or company is a 400 with a message that says what to fill in, never a blank on the letter.
- FR-DG-04: every PDF shows its reference code and a Manila-time timestamp. Code formats: `EL-YYYYMMDD-XXXXXXXX` (endorsement), `FC-YYYYMMDD-XXXXXXXX` (final cover).
- Exactly one ENDORSEMENT_LETTER row per student (FR-WP-05 already queues it) and one FINAL_REPORT_COVER row per student. Regenerating overwrites both the row and the object.
- Bulk generation is capped at **40 students per request** (Vercel `maxDuration`, risk R2). Larger groups get a 400 asking for a smaller batch.
- Every interpolated value goes through `escapeHtml`.
- No Claude/Anthropic attribution in commits.

## Review Focus

1. **A coordinator generates a letter for a student with 8/9 checklist items approved.** Must get 400 and no PDF. → Task 3 test `refuses when the checklist gate is not satisfied`.
2. **Student has no full name or no company yet.** Must get 400 naming the missing field. → Task 3 test `explains which FR-DG-01 field is missing`.
3. **Bulk request with a wrong password.** Must get 401 and generate nothing. → Task 4 test `bulk refuses a wrong password`.
4. **Bulk request for a class group the faculty member doesn't advise.** Must get 403. → Task 4 test `bulk refuses a class group the faculty member doesn't advise`.
5. **Student requests a final cover below the threshold.** Must get 400 stating the hours still needed. → Task 5 test `refuses below the final-report threshold`.

---

### Task 1: Extract the shared render-and-store lifecycle

**Files:**

- Modify: `src/lib/services/documentService.ts`
- Test: `src/lib/services/documentService.test.ts` (existing weekly and monthly tests must stay green, plus one new test)

**Interfaces:**

- Produces: `renderAndStoreDocument(args: { documentId: string; path: string; buildHtml: () => Promise<string>; actingUserId: string; detail?: Record<string, unknown>; sleep?: (ms: number) => Promise<void> }): Promise<DocumentStatus>`. On success it sets GENERATED, `fileUrl` and `generatedAt` and logs `DOCUMENT_GENERATED`. On final failure it sets FAILED, logs `DOCUMENT_GENERATION_FAILED` and `console.error`, and returns FAILED without throwing.

- [ ] **Step 1: Write the failing test** (append to `documentService.test.ts`, and import `renderAndStoreDocument`)

```ts
describe("renderAndStoreDocument", () => {
  it("rebuilds the HTML on each retry attempt and marks GENERATED on success", async () => {
    const buildHtml = jest.fn().mockResolvedValue("<p>x</p>");
    render.mockRejectedValueOnce(new Error("cold start")).mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("endorsement/p-1.pdf");

    const status = await renderAndStoreDocument({
      documentId: "doc-1",
      path: "endorsement/p-1.pdf",
      buildHtml,
      actingUserId: "u-1",
      sleep: noSleep,
    });

    expect(status).toBe(DocumentStatus.GENERATED);
    expect(buildHtml).toHaveBeenCalledTimes(2);
    expect(prismaMock.generatedDocument.update).toHaveBeenLastCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({
        status: DocumentStatus.GENERATED,
        fileUrl: "endorsement/p-1.pdf",
      }),
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/services/documentService.test.ts -t renderAndStoreDocument`
Expected: FAIL. Not exported.

- [ ] **Step 3: Implement** (add to `documentService.ts`, then rewrite the bodies of `generateWeeklyReportPdf` and `generateMonthlyReportPdf` to call it)

```ts
export async function renderAndStoreDocument(args: {
  documentId: string;
  path: string;
  buildHtml: () => Promise<string>;
  actingUserId: string;
  detail?: Record<string, unknown>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<DocumentStatus> {
  const { documentId, path, buildHtml, actingUserId, detail = {}, sleep } = args;
  try {
    await withRetry(
      async () => {
        const pdf = await renderHtmlToPdf(await buildHtml());
        await uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, path, pdf);
      },
      { sleep }
    );
  } catch (error) {
    console.error("PDF generation failed", { documentId, path, error });
    await prisma.generatedDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.FAILED },
    });
    await logEvent({
      userId: actingUserId,
      action: "DOCUMENT_GENERATION_FAILED",
      entityType: "GeneratedDocument",
      entityId: documentId,
      detail: {
        ...detail,
        message: error instanceof Error ? error.message : String(error),
      } as never,
    });
    return DocumentStatus.FAILED;
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
    detail: detail as never,
  });
  return DocumentStatus.GENERATED;
}
```

In `generateWeeklyReportPdf`, replace everything from `const path = …` to the end with:

```ts
const path = `weekly/${data.studentProfileId}/${weeklyReportId}.pdf`;
const status = await renderAndStoreDocument({
  documentId,
  path,
  buildHtml: async () => renderWeeklyReportHtml(data),
  actingUserId,
  detail: { weeklyReportId, referenceCode: data.referenceCode },
  sleep: opts.sleep,
});
return { generatedDocumentId: documentId, status };
```

In `generateMonthlyReportPdf`, likewise:

```ts
const path = `monthly/${doc.studentProfileId}/${doc.periodLabel}.pdf`;
const status = await renderAndStoreDocument({
  documentId: doc.id,
  path,
  buildHtml: async () => {
    const data = await loadMonthlyReportDocumentData(doc.id, referenceCode);
    if (!data) throw new DocumentNotReadyError();
    return renderMonthlyReportHtml(data);
  },
  actingUserId,
  detail: { referenceCode },
  sleep: opts.sleep,
});
return { generatedDocumentId: doc.id, status };
```

- [ ] **Step 4: Run the whole service suite**

Run: `npx jest src/lib/services/documentService.test.ts`
Expected: PASS. All of A's weekly/monthly tests still pass unchanged, plus the new test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/documentService.ts src/lib/services/documentService.test.ts
git commit -m "Extract shared PDF render-and-store lifecycle"
```

---

### Task 2: Endorsement letter template, letterhead, and data loader

**Files:**

- Create: `src/lib/documents/letterhead.ts`, `src/lib/documents/endorsementLetterTemplate.ts`, `src/lib/documents/endorsementLetterData.ts`
- Test: `src/lib/documents/endorsementLetterTemplate.test.ts`, `src/lib/documents/endorsementLetterData.test.ts`

**Interfaces:**

- Produces:
  - `renderLetterhead(): string`
  - `interface EndorsementLetterData { studentProfileId: string; referenceCode: string; endorsementDate: Date; student: { fullName: string; studentNumber: string; program: string; positionTitle: string | null; requiredHours: number }; company: { name: string; address: string; supervisorName: string; supervisorPosition: string | null } }`
  - `renderEndorsementLetterHtml(data: EndorsementLetterData): string`
  - `class EndorsementDataIncompleteError extends Error` (message names the missing field)
  - `loadEndorsementLetterData(studentProfileId: string, referenceCode: string, endorsementDate: Date): Promise<EndorsementLetterData>` (throws `EndorsementDataIncompleteError`)

- [ ] **Step 1: Write the failing tests**

`endorsementLetterTemplate.test.ts`:

```ts
import { renderEndorsementLetterHtml } from "@/lib/documents/endorsementLetterTemplate";

const data = {
  studentProfileId: "p-1",
  referenceCode: "EL-20261011-ABCD1234",
  endorsementDate: new Date("2026-10-11T00:00:00Z"),
  student: {
    fullName: "Juan Dela Cruz",
    studentNumber: "2026-00123-MN-0",
    program: "BSIT",
    positionTitle: "Web Developer Intern",
    requiredHours: 600,
  },
  company: {
    name: "Acme <Corp>",
    address: "Session Rd, Baguio City",
    supervisorName: "Maria Santos",
    supervisorPosition: "IT Manager",
  },
};

it("contains every FR-DG-01 field, the letterhead, and the reference code", () => {
  const html = renderEndorsementLetterHtml(data);
  for (const text of [
    "Juan Dela Cruz",
    "2026-00123-MN-0",
    "Session Rd, Baguio City",
    "Maria Santos",
    "IT Manager",
    "October 11, 2026",
    "EL-20261011-ABCD1234",
    "Saint Louis University",
    "600 hours",
  ]) {
    expect(html).toContain(text);
  }
});

it("escapes interpolated values", () => {
  expect(renderEndorsementLetterHtml(data)).toContain("Acme &lt;Corp&gt;");
});

it("omits the position line cleanly when the supervisor position is unknown", () => {
  const html = renderEndorsementLetterHtml({
    ...data,
    company: { ...data.company, supervisorPosition: null },
  });
  expect(html).not.toContain("—<br");
});
```

`endorsementLetterData.test.ts`:

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  EndorsementDataIncompleteError,
  loadEndorsementLetterData,
} from "@/lib/documents/endorsementLetterData";

beforeEach(() => resetPrismaMock());

const profile = {
  id: "p-1",
  fullName: "Juan Dela Cruz",
  studentNumber: "2026-00123-MN-0",
  program: "BSIT",
  positionTitle: null,
  requiredHours: 600,
  company: {
    name: "Acme",
    address: "Baguio",
    supervisorName: "Maria",
    supervisorPosition: "IT Manager",
  },
};

it("loads FR-DG-01 data", async () => {
  prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue(profile as never);
  const data = await loadEndorsementLetterData("p-1", "EL-1", new Date("2026-10-11T00:00:00Z"));
  expect(data.student.fullName).toBe("Juan Dela Cruz");
  expect(data.company.supervisorPosition).toBe("IT Manager");
});

it("explains which FR-DG-01 field is missing", async () => {
  prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
    ...profile,
    fullName: null,
  } as never);
  await expect(loadEndorsementLetterData("p-1", "EL-1", new Date())).rejects.toThrow(/full name/i);

  prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
    ...profile,
    company: null,
  } as never);
  await expect(loadEndorsementLetterData("p-1", "EL-1", new Date())).rejects.toThrow(
    EndorsementDataIncompleteError
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/documents/endorsementLetter`
Expected: FAIL. Modules not found.

- [ ] **Step 3: Implement**

`src/lib/documents/letterhead.ts`:

```ts
// D3 default: text letterhead until SLU's official letterhead (logo,
// address block) is supplied — replace only this function then.
export function renderLetterhead(): string {
  return `
  <header class="letterhead">
    <p class="eyebrow">Saint Louis University</p>
    <p class="school">School of Accountancy, Management, Computing and Information Studies</p>
    <p class="address">A. Bonifacio Street, Baguio City 2600, Philippines</p>
  </header>`;
}

export const LETTER_CSS = `
  .letterhead { text-align: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 24px; }
  .letterhead .eyebrow { font-size: 14pt; font-weight: bold; letter-spacing: 1px; color: #1e3a5f; margin: 0; }
  .letterhead .school, .letterhead .address { margin: 2px 0; font-size: 9.5pt; color: #333; }
  .letter p { line-height: 1.55; margin: 0 0 12px; text-align: justify; }
  .letter .addressee { margin-bottom: 18px; line-height: 1.4; }
  .letter .closing { margin-top: 40px; }
  .ref { font-size: 8.5pt; color: #555; text-align: right; }
`;
```

`src/lib/documents/endorsementLetterTemplate.ts`:

```ts
import { escapeHtml, formatCalendarDate, formatInstant, PRINT_CSS } from "@/lib/documents/html";
import { LETTER_CSS, renderLetterhead } from "@/lib/documents/letterhead";

export interface EndorsementLetterData {
  studentProfileId: string;
  referenceCode: string;
  endorsementDate: Date;
  student: {
    fullName: string;
    studentNumber: string;
    program: string;
    positionTitle: string | null;
    requiredHours: number;
  };
  company: {
    name: string;
    address: string;
    supervisorName: string;
    supervisorPosition: string | null;
  };
}

// FR-DG-01: student name, student ID, company name/address, supervisor
// name/position, endorsement date, institutional letterhead.
export function renderEndorsementLetterHtml(data: EndorsementLetterData): string {
  const position = data.company.supervisorPosition
    ? `${escapeHtml(data.company.supervisorPosition)}<br />`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Endorsement Letter ${escapeHtml(data.referenceCode)}</title>
<style>${PRINT_CSS}${LETTER_CSS}</style>
</head>
<body>
  ${renderLetterhead()}
  <p class="ref">Ref. ${escapeHtml(data.referenceCode)}</p>
  <div class="letter">
    <p>${escapeHtml(formatCalendarDate(data.endorsementDate))}</p>
    <p class="addressee">
      <strong>${escapeHtml(data.company.supervisorName)}</strong><br />
      ${position}${escapeHtml(data.company.name)}<br />
      ${escapeHtml(data.company.address)}
    </p>
    <p>Dear ${escapeHtml(data.company.supervisorName)},</p>
    <p>
      We are pleased to endorse <strong>${escapeHtml(data.student.fullName)}</strong>
      (Student No. ${escapeHtml(data.student.studentNumber)}), a ${escapeHtml(data.student.program)}
      student of Saint Louis University, for internship at ${escapeHtml(data.company.name)}${
        data.student.positionTitle ? ` as ${escapeHtml(data.student.positionTitle)}` : ""
      }. The internship requires the completion of ${escapeHtml(data.student.requiredHours)} hours
      in accordance with CHED CMO No. 104, Series of 2017.
    </p>
    <p>
      The student has completed all pre-deployment requirements of the department. We look forward
      to your guidance in this internship and thank you for the opportunity extended to our student.
    </p>
    <p class="closing">Respectfully,</p>
    <p><br /><br />Department Internship Coordinator<br />SAMCIS, Saint Louis University</p>
  </div>
  <footer>${escapeHtml(data.referenceCode)} · generated ${escapeHtml(formatInstant(new Date()))} · IDSMS-CIS</footer>
</body>
</html>`;
}
```

`src/lib/documents/endorsementLetterData.ts`:

```ts
import { prisma } from "@/lib/prisma";
import type { EndorsementLetterData } from "@/lib/documents/endorsementLetterTemplate";

export class EndorsementDataIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EndorsementDataIncompleteError";
  }
}

export async function loadEndorsementLetterData(
  studentProfileId: string,
  referenceCode: string,
  endorsementDate: Date
): Promise<EndorsementLetterData> {
  const profile = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentProfileId },
    select: {
      id: true,
      fullName: true,
      studentNumber: true,
      program: true,
      positionTitle: true,
      requiredHours: true,
      company: {
        select: { name: true, address: true, supervisorName: true, supervisorPosition: true },
      },
    },
  });

  if (!profile.fullName?.trim()) {
    throw new EndorsementDataIncompleteError(
      "The student's full name is missing — set it on the student's profile first"
    );
  }
  if (!profile.company) {
    throw new EndorsementDataIncompleteError("The student has no host company assigned yet");
  }

  return {
    studentProfileId: profile.id,
    referenceCode,
    endorsementDate,
    student: {
      fullName: profile.fullName.trim(),
      studentNumber: profile.studentNumber,
      program: profile.program,
      positionTitle: profile.positionTitle,
      requiredHours: profile.requiredHours,
    },
    company: profile.company,
  };
}
```

Add `EndorsementDataIncompleteError` to `BAD_REQUEST_ERRORS` in `src/lib/utils/apiError.ts`.

- [ ] **Step 4: Run tests**

Run: `npx jest src/lib/documents/endorsementLetter`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents src/lib/utils/apiError.ts
git commit -m "Add endorsement letter template, text letterhead, and data loader"
```

---

### Task 3: Single endorsement letter generation + route + profile name field

**Files:**

- Modify: `src/lib/services/documentService.ts` (append), `src/app/(dashboard)/profile/page.tsx` (full-name field for students)
- Create: `src/app/api/students/[studentProfileId]/endorsement-letter/route.ts`, `src/app/api/profile/full-name/route.ts`, `src/app/(dashboard)/profile/full-name-form.tsx`, `src/app/(dashboard)/students/[studentProfileId]/checklist/endorsement-letter-actions.tsx`
- Modify: `src/app/(dashboard)/students/[studentProfileId]/checklist/page.tsx`
- Test: `src/lib/services/documentService.test.ts` (append)

**Interfaces:**

- Consumes: `isEndorsementGateSatisfied`, `ChecklistGateError` (checklistService); Task 1–2 exports.
- Produces:
  - `generateEndorsementReferenceCode(date: Date): string`
  - `generateEndorsementLetterPdf(studentProfileId: string, actingUserId: string, opts?): Promise<{ generatedDocumentId: string; status: DocumentStatus }>`
  - `getEndorsementLetterDocument(studentProfileId: string): Promise<GeneratedDocument | null>`
  - Routes:
    - `POST /api/students/[id]/endorsement-letter`: DEPARTMENT_COORDINATOR, SUPER_ADMIN and FACULTY_ADVISER (with access).
    - `GET /api/students/[id]/endorsement-letter`: anyone with student access (student included).
    - `PATCH /api/profile/full-name`: STUDENT_INTERN only, body `{ fullName }`.

- [ ] **Step 1: Write the failing tests** (append; add `jest.mock("@/lib/services/checklistService", () => { class ChecklistGateError extends Error {} return { ChecklistGateError, isEndorsementGateSatisfied: jest.fn() }; });` and `jest.mock("@/lib/documents/endorsementLetterData", () => ({ loadEndorsementLetterData: jest.fn(), EndorsementDataIncompleteError: class extends Error {} }));` beside the other mocks)

```ts
import { ChecklistGateError, isEndorsementGateSatisfied } from "@/lib/services/checklistService";
import { loadEndorsementLetterData } from "@/lib/documents/endorsementLetterData";
import {
  generateEndorsementLetterPdf,
  generateEndorsementReferenceCode,
} from "@/lib/services/documentService";

describe("generateEndorsementLetterPdf", () => {
  const gate = isEndorsementGateSatisfied as jest.Mock;
  const loadLetter = loadEndorsementLetterData as jest.Mock;

  it("refuses when the checklist gate is not satisfied (FR-CK-04)", async () => {
    gate.mockResolvedValue(false);
    await expect(
      generateEndorsementLetterPdf("p-1", "coord-1", { sleep: noSleep })
    ).rejects.toThrow(ChecklistGateError);
    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("validates FR-DG-01 data before touching the document row", async () => {
    gate.mockResolvedValue(true);
    loadLetter.mockRejectedValue(new Error("The student's full name is missing"));
    await expect(
      generateEndorsementLetterPdf("p-1", "coord-1", { sleep: noSleep })
    ).rejects.toThrow(/full name/);
    expect(prismaMock.generatedDocument.update).not.toHaveBeenCalled();
  });

  it("reuses the FR-WP-05 queued row, assigns a code once, and generates", async () => {
    gate.mockResolvedValue(true);
    loadLetter.mockResolvedValue({ studentProfileId: "p-1" });
    prismaMock.generatedDocument.findFirst.mockResolvedValue({
      id: "doc-el",
      referenceCode: null,
    } as never);
    render.mockResolvedValue(Buffer.from("%PDF"));
    upload.mockResolvedValue("endorsement/p-1.pdf");

    const result = await generateEndorsementLetterPdf("p-1", "coord-1", { sleep: noSleep });

    expect(result).toEqual({ generatedDocumentId: "doc-el", status: DocumentStatus.GENERATED });
    expect(prismaMock.generatedDocument.update).toHaveBeenCalledWith({
      where: { id: "doc-el" },
      data: expect.objectContaining({
        referenceCode: expect.stringMatching(/^EL-\d{8}-[0-9A-F]{8}$/),
      }),
    });
    expect(upload).toHaveBeenCalledWith(
      "generated-documents",
      "endorsement/p-1.pdf",
      expect.any(Buffer)
    );
  });
});

describe("generateEndorsementReferenceCode", () => {
  it("is EL-<YYYYMMDD>-<8 hex>", () => {
    expect(generateEndorsementReferenceCode(new Date("2026-10-11T03:00:00Z"))).toMatch(
      /^EL-20261011-[0-9A-F]{8}$/
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/services/documentService.test.ts -t Endorsement`
Expected: FAIL. Not exported.

- [ ] **Step 3: Implement** (append to `documentService.ts`; add imports for `isEndorsementGateSatisfied`, `ChecklistGateError`, `loadEndorsementLetterData`, `renderEndorsementLetterHtml`)

```ts
function referenceCode(prefix: "EL" | "FC", date: Date): string {
  // Date part in Manila so a letter generated at 07:00 Manila isn't dated "yesterday".
  const manila = new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const random = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${manila.replace(/-/g, "")}-${random}`;
}

export function generateEndorsementReferenceCode(date: Date): string {
  return referenceCode("EL", date);
}

// FR-DG-01 + FR-CK-04. One ENDORSEMENT_LETTER row per student — the row
// workPlanService.reviewWorkPlan queued at approval (FR-WP-05) is reused;
// created here only if a legacy student approved before that existed.
export async function generateEndorsementLetterPdf(
  studentProfileId: string,
  actingUserId: string,
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ generatedDocumentId: string; status: DocumentStatus }> {
  if (!(await isEndorsementGateSatisfied(studentProfileId))) {
    throw new ChecklistGateError(
      "All 9 pre-deployment checklist items must be approved before the endorsement letter can be generated"
    );
  }

  const now = new Date();
  // Validate FR-DG-01 fields first so an incomplete profile never leaves a
  // half-updated document row behind.
  await loadEndorsementLetterData(studentProfileId, "EL-PENDING", now);

  const existing = await prisma.generatedDocument.findFirst({
    where: { studentProfileId, documentType: DocumentType.ENDORSEMENT_LETTER },
    select: { id: true, referenceCode: true },
  });
  const code = existing?.referenceCode ?? generateEndorsementReferenceCode(now);
  const documentId = existing
    ? (await prisma.generatedDocument.update({
        where: { id: existing.id },
        data: { referenceCode: code, status: DocumentStatus.PENDING_DRAFT },
      }),
      existing.id)
    : (
        await prisma.generatedDocument.create({
          data: {
            studentProfileId,
            documentType: DocumentType.ENDORSEMENT_LETTER,
            referenceCode: code,
            status: DocumentStatus.PENDING_DRAFT,
          },
        })
      ).id;

  const status = await renderAndStoreDocument({
    documentId,
    path: `endorsement/${studentProfileId}.pdf`,
    buildHtml: async () =>
      renderEndorsementLetterHtml(await loadEndorsementLetterData(studentProfileId, code, now)),
    actingUserId,
    detail: { studentProfileId, referenceCode: code },
    sleep: opts.sleep,
  });
  return { generatedDocumentId: documentId, status };
}

export async function getEndorsementLetterDocument(studentProfileId: string) {
  return prisma.generatedDocument.findFirst({
    where: { studentProfileId, documentType: DocumentType.ENDORSEMENT_LETTER },
  });
}
```

`src/app/api/students/[studentProfileId]/endorsement-letter/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import {
  generateEndorsementLetterPdf,
  getEndorsementLetterDocument,
  getGeneratedDocumentDownloadUrl,
} from "@/lib/services/documentService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const doc = await getEndorsementLetterDocument(params.studentProfileId);
    if (!doc || doc.status !== "GENERATED") {
      return NextResponse.json(
        { error: "Endorsement letter not generated yet", status: doc?.status ?? null },
        { status: 404 }
      );
    }
    return NextResponse.redirect(await getGeneratedDocumentDownloadUrl(doc));
  } catch (error) {
    return handleApiError(error);
  }
}

// Staff-only: the department issues the endorsement, not the student.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN, Role.FACULTY_ADVISER]);
    await assertCanAccessStudent(user, params.studentProfileId);
    return NextResponse.json(await generateEndorsementLetterPdf(params.studentProfileId, user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/profile/full-name/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { logEvent } from "@/lib/services/auditService";
import { handleApiError } from "@/lib/utils/apiError";

const schema = z.object({ fullName: z.string().trim().min(3, "Enter your full name").max(150) });

// FR-DG-01 needs the legal name on the endorsement letter; students set
// their own (self-only — the profile is resolved from the session, never
// from the request body).
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const { fullName } = schema.parse(await req.json());
    const profile = await prisma.studentProfile.update({
      where: { userId: user.id },
      data: { fullName },
      select: { id: true, fullName: true },
    });
    await logEvent({
      userId: user.id,
      action: "PROFILE_NAME_UPDATED",
      entityType: "StudentProfile",
      entityId: profile.id,
    });
    return NextResponse.json(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/(dashboard)/profile/full-name-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FullNameForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial ?? "");
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    const res = await fetch("/api/profile/full-name", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName }),
    });
    setIsPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.issues?.[0]?.message ?? body.error ?? "Could not save your name");
      return;
    }
    toast.success("Name saved");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-2">
        <Label htmlFor="full-name">
          Full name (as it should appear on your endorsement letter)
        </Label>
        <Input
          id="full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-80"
        />
      </div>
      <Button type="submit" disabled={isPending} className="cursor-pointer">
        {isPending ? "Saving..." : "Save name"}
      </Button>
    </form>
  );
}
```

On `profile/page.tsx`, for `STUDENT_INTERN`, render `<FullNameForm initial={profile.studentProfile?.fullName ?? null} />` in its own Card titled "Legal name".

`src/app/(dashboard)/students/[studentProfileId]/checklist/endorsement-letter-actions.tsx`: re-use `ReportPdfActions` (Workstream A):

```tsx
import { ReportPdfActions } from "../weekly-reports/report-pdf-actions";

export function EndorsementLetterActions({
  studentProfileId,
  status,
  canGenerate,
}: {
  studentProfileId: string;
  status: "GENERATED" | "FAILED" | "PENDING_DRAFT" | null;
  canGenerate: boolean;
}) {
  return (
    <ReportPdfActions
      endpoint={`/api/students/${studentProfileId}/endorsement-letter`}
      status={status}
      canGenerate={canGenerate}
    />
  );
}
```

On the checklist page, below the progress card, add an "Endorsement letter" card:

- Status comes from `getEndorsementLetterDocument(params.studentProfileId)`, with `canGenerate={user.role !== "STUDENT_INTERN" && progress.gateSatisfied}`.
- When the gate isn't satisfied, show muted text: "Available once all 9 requirements are approved".

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx jest && npx tsc --noEmit && npx next lint`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/documentService.ts src/lib/services/documentService.test.ts "src/app/api/students/[studentProfileId]/endorsement-letter" src/app/api/profile "src/app/(dashboard)/profile" "src/app/(dashboard)/students/[studentProfileId]/checklist"
git commit -m "Generate gated endorsement letters and let students set their legal name"
```

---

### Task 4: Bulk endorsement letters for a class group (FR-DG-02, re-auth)

**Files:**

- Modify: `src/lib/services/documentService.ts` (append)
- Create: `src/app/api/class-groups/[classGroupId]/endorsement-letters/route.ts`, `src/app/(dashboard)/my-students/bulk-endorsement-button.tsx`
- Modify: `src/app/(dashboard)/my-students/page.tsx`
- Test: `src/app/api/class-groups/[classGroupId]/endorsement-letters/route.test.ts`

**Interfaces:**

- Consumes: `verifyCredentials(email, password, ipAddress)` from userService (existing; returns `{ ok: boolean, … }`). Check its exact result type before writing the check.
- Produces:
  - `generateBulkEndorsementLetters(classGroupId: string, actingUserId: string): Promise<{ generated: string[]; skipped: { studentProfileId: string; reason: string }[]; failed: string[] }>`
  - `POST /api/class-groups/[classGroupId]/endorsement-letters` with body `{ password }`.

- [ ] **Step 1: Write the failing route tests**

```ts
/** @jest-environment node */
jest.mock("@/lib/auth/session", () => ({ requireUserApi: jest.fn(), requireRole: jest.fn() }));
jest.mock("@/lib/services/userService", () => ({ verifyCredentials: jest.fn() }));
jest.mock("@/lib/services/documentService", () => ({ generateBulkEndorsementLetters: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { facultyClassGroup: { findFirst: jest.fn() }, studentProfile: { count: jest.fn() } },
}));
jest.mock("@/lib/utils/apiError", () => ({
  handleApiError: (e: Error) => Response.json({ error: e.message }, { status: 500 }),
}));

import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/services/userService";
import { generateBulkEndorsementLetters } from "@/lib/services/documentService";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/class-groups/[classGroupId]/endorsement-letters/route";

const params = { params: { classGroupId: "cg-1" } };
const req = (body: unknown) =>
  new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  (requireUserApi as jest.Mock).mockResolvedValue({
    id: "fac-1",
    email: "f@x",
    role: "FACULTY_ADVISER",
  });
  (prisma.facultyClassGroup.findFirst as jest.Mock).mockResolvedValue({ id: "link" });
  (prisma.studentProfile.count as jest.Mock).mockResolvedValue(10);
});

it("bulk refuses a wrong password", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: false, reason: "INVALID_CREDENTIALS" });
  const res = await POST(req({ password: "nope" }), params);
  expect(res.status).toBe(401);
  expect(generateBulkEndorsementLetters).not.toHaveBeenCalled();
});

it("bulk refuses a class group the faculty member doesn't advise", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: true });
  (prisma.facultyClassGroup.findFirst as jest.Mock).mockResolvedValue(null);
  const res = await POST(req({ password: "right" }), params);
  expect(res.status).toBe(403);
  expect(generateBulkEndorsementLetters).not.toHaveBeenCalled();
});

it("refuses more than 40 students in one request", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: true });
  (prisma.studentProfile.count as jest.Mock).mockResolvedValue(41);
  const res = await POST(req({ password: "right" }), params);
  expect(res.status).toBe(400);
});

it("returns the generated/skipped/failed breakdown", async () => {
  (verifyCredentials as jest.Mock).mockResolvedValue({ ok: true });
  (generateBulkEndorsementLetters as jest.Mock).mockResolvedValue({
    generated: ["p-1"],
    skipped: [],
    failed: [],
  });
  const res = await POST(req({ password: "right" }), params);
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ generated: ["p-1"], skipped: [], failed: [] });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest "src/app/api/class-groups"`
Expected: FAIL. Route not found.

- [ ] **Step 3: Implement**

Append to `documentService.ts`:

```ts
// FR-DG-02. Sequential on purpose: one headless Chrome at a time keeps
// memory inside a single serverless instance's limits (risk R2).
export async function generateBulkEndorsementLetters(classGroupId: string, actingUserId: string) {
  const students = await prisma.studentProfile.findMany({
    where: { classGroupId, deletedAt: null },
    select: { id: true },
    orderBy: { studentNumber: "asc" },
  });
  const result = {
    generated: [] as string[],
    skipped: [] as { studentProfileId: string; reason: string }[],
    failed: [] as string[],
  };
  for (const { id } of students) {
    try {
      const { status } = await generateEndorsementLetterPdf(id, actingUserId);
      (status === DocumentStatus.GENERATED ? result.generated : result.failed).push(id);
    } catch (error) {
      // Gate not met / profile incomplete are expected per-student outcomes.
      result.skipped.push({
        studentProfileId: id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
```

`src/app/api/class-groups/[classGroupId]/endorsement-letters/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/services/userService";
import { generateBulkEndorsementLetters } from "@/lib/services/documentService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BULK = 40;
const schema = z.object({ password: z.string().min(1) });

// FR-DG-02 bulk export; NFR-SEC-05 re-authentication via password re-entry.
export async function POST(req: NextRequest, { params }: { params: { classGroupId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);

    const { password } = schema.parse(await req.json());
    const auth = await verifyCredentials(user.email, password, req.headers.get("x-forwarded-for"));
    if (!auth.ok) {
      return NextResponse.json({ error: "Password confirmation failed" }, { status: 401 });
    }

    if (user.role === Role.FACULTY_ADVISER) {
      const link = await prisma.facultyClassGroup.findFirst({
        where: { facultyId: user.id, classGroupId: params.classGroupId },
        select: { id: true },
      });
      if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const count = await prisma.studentProfile.count({
      where: { classGroupId: params.classGroupId, deletedAt: null },
    });
    if (count > MAX_BULK) {
      return NextResponse.json(
        {
          error: `This class group has ${count} students; bulk generation is limited to ${MAX_BULK} per request`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(await generateBulkEndorsementLetters(params.classGroupId, user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
```

Note: `verifyCredentials` also increments failed-login counters, so repeated wrong passwords here can lock the account (FR-UM-10). That's intended: it's the same credential. Check `verifyCredentials`'s return shape in `userService.ts` and adapt `auth.ok` if the field differs.

`bulk-endorsement-button.tsx`: a client component with a password `Input` in a `Dialog` (`@/components/ui/dialog`). It POSTs `{ password }`, then toasts `Generated X · Skipped Y · Failed Z` and lists skip reasons. Render it per class group on `my-students/page.tsx`.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx jest && npx tsc --noEmit && npx next lint`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/documentService.ts "src/app/api/class-groups" "src/app/(dashboard)/my-students"
git commit -m "Add re-authenticated bulk endorsement letter generation"
```

---

### Task 5: Final report cover page (FR-DG-03, FR-FT-01 threshold)

**Files:**

- Create: `src/lib/documents/finalCoverTemplate.ts`, `src/app/api/students/[studentProfileId]/final-cover/route.ts`
- Modify: `src/lib/services/documentService.ts` (append), `src/lib/services/attendanceService.ts` (append `getFinalReportThreshold`), student dashboard (`(dashboard)/page.tsx`)
- Test: `src/lib/documents/finalCoverTemplate.test.ts`, append to `documentService.test.ts` and `attendanceService.test.ts`

**Interfaces:**

- Produces:
  - `getFinalReportThreshold(program: Program, requiredHours: number): Promise<number>`. Reads SystemConfig `final_report_threshold:{program}`; otherwise BSIT → 500, else `Math.ceil(requiredHours * 5 / 6)`.
  - `class FinalReportLockedError extends Error`
  - `renderFinalCoverHtml(data: { referenceCode; generatedAt; student: { fullName; studentNumber; program }; company: { name } | null; renderedHours; requiredHours; academicYear; semesterName }): string`
  - `generateFinalCoverPdf(studentProfileId, actingUserId, opts?)`, the same return shape as the other generators.
  - `GET/POST /api/students/[id]/final-cover`: POST is the owning student only; GET is anyone with access.

- [ ] **Step 1: Write the failing tests**

`attendanceService.test.ts`:

```ts
describe("getFinalReportThreshold", () => {
  it("defaults to 500 for BSIT and 5/6 of required hours otherwise", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    await expect(getFinalReportThreshold(Program.BSIT, 600)).resolves.toBe(500);
    await expect(getFinalReportThreshold(Program.BSCS, 240)).resolves.toBe(200);
  });

  it("uses the configured value when set", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue({ configValue: 450 } as never);
    await expect(getFinalReportThreshold(Program.BSIT, 600)).resolves.toBe(450);
  });
});
```

`documentService.test.ts`:

```ts
describe("generateFinalCoverPdf", () => {
  it("refuses below the final-report threshold and says how many hours remain", async () => {
    prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
      id: "p-1",
      program: "BSIT",
      requiredHours: 600,
      fullName: "Juan",
      studentNumber: "1",
      company: null,
      semester: { name: "1st Semester", academicYear: "2026-2027" },
    } as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { dailyEntries: [{ actualHours: 120 }] },
    ] as never);
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);

    await expect(generateFinalCoverPdf("p-1", "student-1", { sleep: noSleep })).rejects.toThrow(
      /380 more hours/
    );
  });
});
```

`finalCoverTemplate.test.ts`:

```ts
import { renderFinalCoverHtml } from "@/lib/documents/finalCoverTemplate";

it("renders title, student, hours, reference code; escapes text", () => {
  const html = renderFinalCoverHtml({
    referenceCode: "FC-20270115-ABCD1234",
    generatedAt: new Date("2027-01-15T02:00:00Z"),
    student: { fullName: "Juan <b>", studentNumber: "1", program: "BSIT" },
    company: { name: "Acme" },
    renderedHours: 600,
    requiredHours: 600,
    academicYear: "2026-2027",
    semesterName: "1st Semester",
  });
  expect(html).toContain("Final Internship Report");
  expect(html).toContain("FC-20270115-ABCD1234");
  expect(html).toContain("600 / 600 hours");
  expect(html).toContain("Juan &lt;b&gt;");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest -t "FinalReportThreshold|generateFinalCoverPdf|renders title"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `attendanceService.ts`:

```ts
const FINAL_REPORT_THRESHOLD_KEY = (program: Program) => `final_report_threshold:${program}`;

// FR-FT-01: configurable unlock threshold for the final technical report
// (PRD example: 500 of 600 for BSIT). Admin-overridable like required hours.
export async function getFinalReportThreshold(
  program: Program,
  requiredHours: number
): Promise<number> {
  const config = await prisma.systemConfig.findUnique({
    where: { configKey: FINAL_REPORT_THRESHOLD_KEY(program) },
    select: { configValue: true },
  });
  if (config && typeof config.configValue === "number" && config.configValue > 0) {
    return config.configValue;
  }
  return program === Program.BSIT ? 500 : Math.ceil((requiredHours * 5) / 6);
}
```

`src/lib/documents/finalCoverTemplate.ts`:

```ts
import { escapeHtml, formatInstant, PRINT_CSS } from "@/lib/documents/html";
import { LETTER_CSS, renderLetterhead } from "@/lib/documents/letterhead";

export interface FinalCoverData {
  referenceCode: string;
  generatedAt: Date;
  student: { fullName: string; studentNumber: string; program: string };
  company: { name: string } | null;
  renderedHours: number;
  requiredHours: number;
  academicYear: string;
  semesterName: string;
}

export function renderFinalCoverHtml(data: FinalCoverData): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Final Internship Report Cover ${escapeHtml(data.referenceCode)}</title>
<style>${PRINT_CSS}${LETTER_CSS}
  .cover { text-align: center; margin-top: 120px; }
  .cover h1 { font-size: 24pt; margin-bottom: 8px; }
  .cover .meta { margin-top: 80px; line-height: 1.8; }
</style>
</head>
<body>
  ${renderLetterhead()}
  <section class="cover">
    <h1>Final Internship Report</h1>
    <p>${escapeHtml(data.semesterName)}, A.Y. ${escapeHtml(data.academicYear)}</p>
    <div class="meta">
      <p><strong>${escapeHtml(data.student.fullName)}</strong></p>
      <p>${escapeHtml(data.student.studentNumber)} · ${escapeHtml(data.student.program)}</p>
      <p>Host company: ${escapeHtml(data.company?.name)}</p>
      <p>Hours rendered: ${escapeHtml(data.renderedHours)} / ${escapeHtml(data.requiredHours)} hours</p>
    </div>
  </section>
  <footer>${escapeHtml(data.referenceCode)} · generated ${escapeHtml(formatInstant(data.generatedAt))} · IDSMS-CIS</footer>
</body>
</html>`;
}
```

Append to `documentService.ts` (imports: `calculateRenderedHours`, `getFinalReportThreshold` from attendanceService; `renderFinalCoverHtml`):

```ts
export class FinalReportLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinalReportLockedError";
  }
}

export async function generateFinalCoverPdf(
  studentProfileId: string,
  actingUserId: string,
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ generatedDocumentId: string; status: DocumentStatus }> {
  const profile = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentProfileId },
    select: {
      id: true,
      program: true,
      requiredHours: true,
      fullName: true,
      studentNumber: true,
      company: { select: { name: true } },
      semester: { select: { name: true, academicYear: true } },
    },
  });
  const renderedHours = await calculateRenderedHours(studentProfileId);
  const threshold = await getFinalReportThreshold(profile.program, profile.requiredHours);
  if (renderedHours < threshold) {
    throw new FinalReportLockedError(
      `The final report cover unlocks at ${threshold} confirmed hours — ${Math.round((threshold - renderedHours) * 100) / 100} more hours to go`
    );
  }
  if (!profile.fullName?.trim()) {
    throw new FinalReportLockedError("Set your full name on the Profile page first");
  }

  const now = new Date();
  const existing = await prisma.generatedDocument.findFirst({
    where: { studentProfileId, documentType: DocumentType.FINAL_REPORT_COVER },
    select: { id: true, referenceCode: true },
  });
  const code = existing?.referenceCode ?? referenceCode("FC", now);
  const documentId = existing
    ? (await prisma.generatedDocument.update({
        where: { id: existing.id },
        data: { referenceCode: code, status: DocumentStatus.PENDING_DRAFT },
      }),
      existing.id)
    : (
        await prisma.generatedDocument.create({
          data: {
            studentProfileId,
            documentType: DocumentType.FINAL_REPORT_COVER,
            referenceCode: code,
            status: DocumentStatus.PENDING_DRAFT,
          },
        })
      ).id;

  const status = await renderAndStoreDocument({
    documentId,
    path: `final-cover/${studentProfileId}.pdf`,
    buildHtml: async () =>
      renderFinalCoverHtml({
        referenceCode: code,
        generatedAt: now,
        student: {
          fullName: profile.fullName!.trim(),
          studentNumber: profile.studentNumber,
          program: profile.program,
        },
        company: profile.company,
        renderedHours,
        requiredHours: profile.requiredHours,
        academicYear: profile.semester.academicYear,
        semesterName: profile.semester.name,
      }),
    actingUserId,
    detail: { studentProfileId, referenceCode: code },
    sleep: opts.sleep,
  });
  return { generatedDocumentId: documentId, status };
}
```

Add `FinalReportLockedError` to `BAD_REQUEST_ERRORS`. Create `src/app/api/students/[studentProfileId]/final-cover/route.ts` mirroring the endorsement-letter route: POST is `requireRole([STUDENT_INTERN])` + `assertCanAccessStudent` → `generateFinalCoverPdf`; GET is the signed-URL redirect for `FINAL_REPORT_COVER`. On the student dashboard, add a "Final report cover" card with `ReportPdfActions` (endpoint `/api/students/${id}/final-cover`). It shows the threshold progress "X / 500 confirmed hours" until the threshold is reached.

- [ ] **Step 4: Run everything**

Run: `npx jest && npx tsc --noEmit && npx next lint && npx next build`
Expected: green.

- [ ] **Step 5: Manual check (dev DB)**

Follow these steps in order:

1. As the coordinator test account, approve all 9 checklist items for the test student.
2. As the student, set the full name.
3. As the coordinator, generate the endorsement letter. Expect GENERATED, and the PDF shows every FR-DG-01 field.
4. As the student, open the final cover. Expect 400 "…more hours to go", because the test student has 40 confirmed hours.

- [ ] **Step 6: Commit**

```bash
git add src/lib src/app
git commit -m "Add threshold-gated final report cover page PDF"
```

---

## Self-review (completed)

- **Spec coverage:**
  - FR-DG-01: Tasks 2–3.
  - FR-DG-02 + NFR-SEC-05: Task 4.
  - FR-DG-03 (endorsement and final cover): Tasks 3 and 5.
  - FR-DG-04: reference codes plus timestamps in every template.
  - FR-DG-07: the shared lifecycle (Task 1).
  - FR-CK-04 gate: Task 3.
  - FR-FT-01 threshold: Task 5.
  - FR-FT-02/03 (final report content and coordinator review) are Module 7. They're out of scope for Phase 4 and listed in the roadmap as later work.
- **Placeholders:** Task 4's dialog component is described, not written out. It's a straightforward form using existing `Dialog`/`Input` patterns, and the route and service around it are fully specified.
- **Types:** `renderAndStoreDocument` args are consistent across Tasks 1, 3 and 5; the `ReportPdfActions` reuse matches A's signature.
- **Review Focus:** all five map to named tests (Tasks 3, 4 and 5).
