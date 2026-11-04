import { escapeHtml, formatInstant } from "@/lib/documents/html";
import { samcisDocument } from "@/lib/documents/slu";

// SLU's Journal on Learning Experience (WWR & JLE templates, page 3): one month's
// narrative, written by the intern. No signature: the guidelines say it is NOT noted
// by the work supervisor.
export interface MonthlyReportDocumentData {
  generatedDocumentId: string;
  studentProfileId: string;
  calendarMonth: string; // "YYYY-MM"
  referenceCode: string;
  generatedAt: Date;
  student: { name: string; office: string | null };
  narrative: string;
}

export function monthTitle(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Blank lines separate paragraphs, as the template asks ("divide separate topics into
// paragraphs"); single line breaks inside a paragraph are kept.
const paragraphs = (text: string) =>
  text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p class="para">${escapeHtml(p.trim())}</p>`)
    .join("");

export function renderMonthlyReportHtml(data: MonthlyReportDocumentData): string {
  return samcisDocument(
    `Journal on Learning Experience ${data.referenceCode}`,
    `
  <style>
    .para { white-space: pre-wrap; text-align: justify; margin: 0 0 11pt; }
    .who { grid-template-columns: 1fr 1fr; margin-bottom: 0.2in; }
  </style>
  <div class="title">
    <h1>Journal on Learning Experience</h1>
    <p>Month: ${escapeHtml(monthTitle(data.calendarMonth))}</p>
  </div>
  <div class="who">
    <p>Name: <strong>${escapeHtml(data.student.name)}</strong></p>
    <p><strong>Office</strong>: <strong>${escapeHtml(data.student.office)}</strong></p>
  </div>
  ${paragraphs(data.narrative)}
  <p class="ref">${escapeHtml(data.referenceCode)} · generated ${escapeHtml(formatInstant(data.generatedAt))} · IDSMS-CIS</p>`
  );
}
