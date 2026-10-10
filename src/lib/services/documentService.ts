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
