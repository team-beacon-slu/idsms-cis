// Server-side PDF generation via Puppeteer, with failure recovery/retry logic.
// See PRD Module 8 (FR-DG-*), especially FR-DG-07 (retry with exponential backoff).
import { randomUUID } from "crypto";
import { DocumentStatus, DocumentType, type GeneratedDocument } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { getConfirmedSubmission } from "@/lib/services/weeklyReportService";
import { DocumentNotReadyError } from "@/lib/documents/errors";
import { loadMonthlyReportDocumentData } from "@/lib/documents/monthlyReportData";
import { renderMonthlyReportHtml } from "@/lib/documents/monthlyReportTemplate";
import { loadWeeklyReportDocumentData } from "@/lib/documents/weeklyReportData";
import { renderWeeklyReportHtml } from "@/lib/documents/weeklyReportTemplate";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import {
  GENERATED_DOCUMENTS_BUCKET,
  PdfTooLargeError,
  getSignedUrl,
  uploadPdfBuffer,
} from "@/lib/storage";
import { toDateKey } from "@/lib/utils/reportDeadline";

export { DocumentNotReadyError };

type Sleep = (ms: number) => Promise<void>;
type GenerationResult = { generatedDocumentId: string; status: DocumentStatus };

const defaultSleep: Sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Retrying these can't change the outcome: the content isn't confirmed, or
// the same content renders to the same oversized PDF.
const NON_RETRYABLE_ERRORS = [DocumentNotReadyError, PdfTooLargeError];

// The /pdf routes allow 120s (maxDuration). Each attempt is bounded by
// renderHtmlToPdf's per-step timeouts (~45s), so no new attempt may start
// after 60s — otherwise the platform kills the function before the FAILED
// status is written and the row is stuck in PENDING_DRAFT.
export const GENERATION_DEADLINE_MS = 60_000;

// FR-DG-07: "a maximum of 3 retries with exponential backoff" — one attempt
// plus up to 3 retries, waiting 1s, 2s, 4s between them, cut short by
// `deadlineMs` and never repeated for a non-retryable error.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number;
    baseDelayMs?: number;
    sleep?: Sleep;
    deadlineMs?: number;
    now?: () => number;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 1000,
    sleep = defaultSleep,
    deadlineMs = Infinity,
    now = Date.now,
  } = opts;
  const startedAt = now();
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (NON_RETRYABLE_ERRORS.some((NonRetryable) => error instanceof NonRetryable)) throw error;
      lastError = error;
      if (attempt === retries) break;
      const delay = baseDelayMs * 2 ** attempt;
      if (now() - startedAt + delay >= deadlineMs) break;
      await sleep(delay);
    }
  }
  throw lastError;
}

export function weeklyPeriodLabel(weekStart: Date): string {
  return toDateKey(weekStart);
}

// Status/audit writes after rendering must never turn a handled outcome into
// a 500 — log them with context and carry on.
async function bestEffort(what: string, documentId: string, write: () => Promise<unknown>) {
  try {
    await write();
  } catch (error) {
    console.error(`PDF ${what} bookkeeping failed`, { documentId, error });
  }
}

function markFailed(documentId: string) {
  return bestEffort("FAILED-status", documentId, () =>
    prisma.generatedDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.FAILED },
    })
  );
}

// Shared lifecycle for every document type (weekly, monthly, endorsement
// letter, final cover): build HTML + render + upload with retry, then
// GENERATED, or — per FR-DG-07 — keep the submission, log, mark FAILED and
// let the user regenerate. The row must already be PENDING_DRAFT. buildHtml
// runs inside each attempt, so data loaded there is fresh on retry; load
// anything whose absence is permanent *before* calling this (it isn't retried).
export async function renderAndStoreDocument(args: {
  documentId: string;
  path: string;
  buildHtml: () => string | Promise<string>;
  actingUserId: string;
  detail?: Record<string, string>;
  sleep?: Sleep;
}): Promise<DocumentStatus> {
  const { documentId, path, actingUserId, detail: auditDetail = {} } = args;
  try {
    await withRetry(
      async () => {
        const pdf = await renderHtmlToPdf(await args.buildHtml());
        await uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, path, pdf);
      },
      { sleep: args.sleep, deadlineMs: GENERATION_DEADLINE_MS }
    );
  } catch (error) {
    console.error("Report PDF generation failed", { documentId, ...auditDetail, error });
    await markFailed(documentId);
    await bestEffort("audit", documentId, () =>
      logEvent({
        userId: actingUserId,
        action: "DOCUMENT_GENERATION_FAILED",
        entityType: "GeneratedDocument",
        entityId: documentId,
        detail: { ...auditDetail, message: error instanceof Error ? error.message : String(error) },
      })
    );
    return DocumentStatus.FAILED;
  }

  try {
    await prisma.generatedDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.GENERATED, fileUrl: path, generatedAt: new Date() },
    });
  } catch (error) {
    // The file is uploaded but the row can't say so — report FAILED so the
    // UI offers Regenerate rather than a download that 404s.
    console.error("PDF uploaded but its GENERATED status could not be saved", {
      documentId,
      error,
    });
    await markFailed(documentId);
    return DocumentStatus.FAILED;
  }
  await bestEffort("audit", documentId, () =>
    logEvent({
      userId: actingUserId,
      action: "DOCUMENT_GENERATED",
      entityType: "GeneratedDocument",
      entityId: documentId,
      detail: auditDetail,
    })
  );
  return DocumentStatus.GENERATED;
}

// Weekly rows are created here on first generation (the weekly report has no
// generated_documents row of its own). One row per (student, WEEKLY_REPORT,
// week): a resubmission after Return updates the same row's referenceCode
// instead of adding a second row, which keeps referenceCode @unique satisfied
// and the Storage object overwritten in place (R11).
export async function generateWeeklyReportPdf(
  weeklyReportId: string,
  actingUserId: string,
  opts: { sleep?: Sleep } = {}
): Promise<GenerationResult> {
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
  let documentId: string;
  if (existing) {
    await prisma.generatedDocument.update({ where: { id: existing.id }, data: pending });
    documentId = existing.id;
  } else {
    const created = await prisma.generatedDocument.create({
      data: {
        studentProfileId: data.studentProfileId,
        documentType: DocumentType.WEEKLY_REPORT,
        periodLabel,
        ...pending,
      },
    });
    documentId = created.id;
  }

  const status = await renderAndStoreDocument({
    documentId,
    path: `weekly/${data.studentProfileId}/${weeklyReportId}.pdf`,
    actingUserId,
    buildHtml: () => renderWeeklyReportHtml(data),
    detail: { weeklyReportId, referenceCode: data.referenceCode },
    sleep: opts.sleep,
  });
  return { generatedDocumentId: documentId, status };
}

// The week's document, or null when there is none for the submission the
// student currently stands behind — a PDF carrying an older reference code
// (from before a Return + resubmit) is stale and must not be served.
export async function getWeeklyReportDocument(
  weeklyReportId: string
): Promise<GeneratedDocument | null> {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    select: { studentProfileId: true, weekStart: true, status: true, revisionHistory: true },
  });
  if (!report) return null;
  const submission = getConfirmedSubmission(report);
  if (!submission) return null;

  const doc = await prisma.generatedDocument.findFirst({
    where: {
      studentProfileId: report.studentProfileId,
      documentType: DocumentType.WEEKLY_REPORT,
      periodLabel: weeklyPeriodLabel(report.weekStart),
    },
  });
  return doc && doc.referenceCode === submission.referenceCode ? doc : null;
}

export async function getGeneratedDocumentDownloadUrl(doc: GeneratedDocument): Promise<string> {
  if (doc.status !== DocumentStatus.GENERATED || !doc.fileUrl) {
    throw new DocumentNotReadyError("This PDF has not been generated yet");
  }
  return getSignedUrl(GENERATED_DOCUMENTS_BUCKET, doc.fileUrl);
}

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
  opts: { sleep?: Sleep } = {}
): Promise<GenerationResult> {
  const doc = await prisma.generatedDocument.findUnique({ where: { id: generatedDocumentId } });
  if (!doc || doc.documentType !== DocumentType.MONTHLY_REPORT || !doc.periodLabel) {
    throw new DocumentNotReadyError("Submit the monthly report before generating its PDF");
  }

  const referenceCode = doc.referenceCode ?? generateMonthlyReportReferenceCode(doc.periodLabel);
  // Loaded before the retry loop: a missing document is permanent (400),
  // not a rendering failure worth retrying.
  const data = await loadMonthlyReportDocumentData(doc.id, referenceCode);
  if (!data) throw new DocumentNotReadyError();

  await prisma.generatedDocument.update({
    where: { id: doc.id },
    data: { referenceCode, status: DocumentStatus.PENDING_DRAFT },
  });

  const status = await renderAndStoreDocument({
    documentId: doc.id,
    path: `monthly/${doc.studentProfileId}/${doc.periodLabel}.pdf`,
    actingUserId,
    buildHtml: () => renderMonthlyReportHtml(data),
    detail: { referenceCode },
    sleep: opts.sleep,
  });
  return { generatedDocumentId: doc.id, status };
}
