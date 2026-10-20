// Workstream H: the Final Technical Report PDF — WS-E's cover page, then the
// sections, evaluation scores and the attachment list. Pure: same input,
// same HTML.
import {
  COVER_CSS,
  renderFinalCoverSection,
  type FinalCoverData,
} from "@/lib/documents/finalCoverTemplate";
import { escapeHtml, formatInstant } from "@/lib/documents/html";
import {
  ATTACHMENT_KEYS,
  ATTACHMENT_LABELS,
  SECTION_KEYS,
  SECTION_LABELS,
} from "@/lib/validators/finalReport";

export interface FinalReportDocumentData {
  cover: FinalCoverData;
  sections: Partial<Record<string, string>>;
  supervisorScore: number | null;
  supervisorScale: number | null;
  peerScore: number | null;
  peerScale: number | null;
  attachments: Partial<Record<string, boolean>>;
  preview: boolean;
}

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const score = (v: number | null, scale: number | null) =>
  v == null || scale == null ? "—" : `${escapeHtml(v)} / ${escapeHtml(scale)}`;

export function renderFinalReportHtml(data: FinalReportDocumentData): string {
  const sections = SECTION_KEYS.map(
    (k) => `
  <section>
    <h2>${title(SECTION_LABELS[k])}</h2>
    <p class="text">${escapeHtml(data.sections[k])}</p>
  </section>`
  ).join("");

  const attachments = ATTACHMENT_KEYS.map(
    (k) =>
      `<li>${sentence(ATTACHMENT_LABELS[k])}: ${data.attachments[k] ? "attached" : "not attached"}</li>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Final Technical Report ${escapeHtml(data.cover.referenceCode)}</title>
<style>${COVER_CSS}
  .report { page-break-before: always; }
  .report .text { white-space: pre-wrap; }
</style>
</head>
<body>
  ${data.preview ? '<p class="watermark">PREVIEW — NOT YET APPROVED</p>' : ""}
  ${renderFinalCoverSection(data.cover)}
  <div class="report">
    ${sections}
    <section>
      <h2>Evaluation Scores</h2>
      <p>Supervisor evaluation: ${score(data.supervisorScore, data.supervisorScale)}</p>
      <p>Peer evaluation: ${score(data.peerScore, data.peerScale)}</p>
    </section>
    <section>
      <h2>Attachments</h2>
      <p>Submitted in Google Classroom with this report:</p>
      <ul>${attachments}</ul>
    </section>
  </div>
  <footer>${escapeHtml(data.cover.referenceCode)} · generated ${escapeHtml(formatInstant(data.cover.generatedAt))} · IDSMS-CIS</footer>
</body>
</html>`;
}
