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

export const COVER_CSS = `${PRINT_CSS}${LETTER_CSS}
  .cover { text-align: center; margin-top: 120px; }
  .cover h1 { font-size: 24pt; margin-bottom: 8px; }
  .cover .meta { margin-top: 80px; line-height: 1.8; }
`;

export function renderFinalCoverHtml(data: FinalCoverData): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Final Internship Report Cover ${escapeHtml(data.referenceCode)}</title>
<style>${COVER_CSS}</style>
</head>
<body>
  ${renderFinalCoverSection(data)}
  <footer>${escapeHtml(data.referenceCode)} · generated ${escapeHtml(formatInstant(data.generatedAt))} · IDSMS-CIS</footer>
</body>
</html>`;
}

// The cover page body, shared with the Final Technical Report (WS-H).
export function renderFinalCoverSection(data: FinalCoverData): string {
  return `${renderLetterhead()}
  <section class="cover">
    <h1>Final Internship Report</h1>
    <p>${escapeHtml(data.semesterName)}, A.Y. ${escapeHtml(data.academicYear)}</p>
    <div class="meta">
      <p><strong>${escapeHtml(data.student.fullName)}</strong></p>
      <p>${escapeHtml(data.student.studentNumber)} · ${escapeHtml(data.student.program)}</p>
      <p>Host company: ${escapeHtml(data.company?.name)}</p>
      <p>Hours rendered: ${escapeHtml(data.renderedHours)} / ${escapeHtml(data.requiredHours)} hours</p>
    </div>
  </section>`;
}
