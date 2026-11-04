import { escapeHtml, formatInstant } from "@/lib/documents/html";
import { fontFaces } from "@/lib/documents/fonts";

// The technical report's title page, in SLU's "Format for Title Page" (Technical Report
// template). Printed on its own as the final report cover, and as page 1 of the report.
export interface FinalCoverData {
  referenceCode: string;
  generatedAt: Date;
  student: { fullName: string; studentNumber: string; program: string };
  company: { name: string } | null;
  adviserName: string | null;
}

// SLU's course numbers for the practicum (Technical Report: "IT 421/CS331/MMA 421").
const COURSE: Record<string, string> = { BSIT: "IT 421", BSCS: "CS 331", BMMA: "MMA 421" };
const DEPARTMENT: Record<string, string> = {
  BSIT: "Information Technology",
  BSCS: "Computer Science",
  BMMA: "Multimedia Arts",
};

const monthYear = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "Asia/Manila" });

// 8.5 x 13 in, Cambria 12, 1-inch margins, 1.5 spacing (Technical Report instructions).
export function reportCss(): string {
  return `${fontFaces("Cambria")}
  @page { size: 8.5in 13in; margin: 1in; }
  * { box-sizing: border-box; }
  body { font-family: Cambria, Caladea, Georgia, serif; font-size: 12pt; line-height: 1.5; color: #000; margin: 0; }
  p { margin: 0; }
  .title-page { text-align: center; font-weight: bold; line-height: 1.25; }
  .title-page .gap { height: 0.95in; }
  .title-page .rule { font-weight: normal; }
  .title-page .role { font-weight: normal; font-style: italic; }
  .title-page .date { font-weight: normal; }`;
}

export function renderFinalCoverSection(data: FinalCoverData): string {
  const program = data.student.program;
  return `
  <section class="title-page" id="title-page">
    <div class="gap"></div>
    <p>Internship: <em>${escapeHtml(data.company?.name)}</em></p>
    <div class="gap"></div>
    <p class="rule">---------------</p>
    <div class="gap"></div>
    <p>A Technical Report</p>
    <p>Presented to the Faculty of</p>
    <p>The Department of ${escapeHtml(DEPARTMENT[program] ?? program)}</p>
    <p>the School of Accountancy, Business, Computing and Information Studies</p>
    <p>St. Louis University</p>
    <div class="gap"></div>
    <p class="rule">---------------</p>
    <div class="gap"></div>
    <p>In Partial Fulfillment of the</p>
    <p>Requirements for the Course</p>
    <p>${escapeHtml(COURSE[program] ?? program)} Practicum</p>
    <div class="gap"></div>
    <p>Submitted to :</p>
    <p>&nbsp;</p>
    <p>${escapeHtml(data.adviserName)}</p>
    <p class="role">Practicum Adviser</p>
    <div class="gap"></div>
    <p>Submitted by:</p>
    <p>&nbsp;</p>
    <p>${escapeHtml(data.student.fullName)}</p>
    <p>&nbsp;</p>
    <p class="date">${escapeHtml(monthYear(data.generatedAt))}</p>
  </section>`;
}

export function renderFinalCoverHtml(data: FinalCoverData): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Technical Report Title Page ${escapeHtml(data.referenceCode)}</title>
<style>${reportCss()}
  .ref { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 7pt; color: #777; }</style>
</head>
<body>
  ${renderFinalCoverSection(data)}
  <p class="ref">${escapeHtml(data.referenceCode)} · generated ${escapeHtml(formatInstant(data.generatedAt))} · IDSMS-CIS</p>
</body>
</html>`;
}
