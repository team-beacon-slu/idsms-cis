import { escapeHtml, formatCalendarDate, formatInstant } from "@/lib/documents/html";
import { fontFaces } from "@/lib/documents/fonts";
import {
  COMMENT_QUESTIONS,
  FORM,
  IMPLEMENTATION_LEVELS,
  OBLIGATIONS,
  QUALITY,
  QUALITY_LEVELS,
} from "@/lib/validators/hteEvaluation";
import type { OwnEvaluationForm } from "@/lib/services/predeployment/companyEvaluationService";

const PAGES = 5;

// Fixed widths, so a table continued on the next page lines up with the one above it.
const COLS = `<colgroup><col style="width: 38%" />${'<col style="width: 15.5%" />'.repeat(4)}</colgroup>`;

// VPAA's document-control box, top right of every page.
const docBox = (page: number) => `
  <table class="docbox">
    <tr><td>Document Code</td><td>${FORM.code}</td></tr>
    <tr><td>Revision No.</td><td>${FORM.revision}</td></tr>
    <tr><td>Effectivity</td><td>${FORM.effectivity}</td></tr>
    <tr><td>Page</td><td><strong>${page}</strong> of <strong>${PAGES}</strong></td></tr>
  </table>`;

// Drawn, not a glyph: the stand-in fonts have no check mark.
const TICK = `<svg viewBox="0 0 16 16" width="14" height="14" aria-label="selected"><path d="M2 8.5l4 4 8-9" fill="none" stroke="#000" stroke-width="2"/></svg>`;

function ratingRows(
  items: readonly string[],
  ratings: number[],
  start: number,
  from = 0,
  to = items.length
) {
  return items
    .slice(from, to)
    .map((text, k) => {
      const i = from + k;
      const cells = [4, 3, 2, 1]
        .map((v) => `<td class="mark">${ratings[i] === v ? TICK : ""}</td>`)
        .join("");
      return `<tr><td class="item"><span class="n">${start + i}.</span> ${escapeHtml(text)}</td>${cells}</tr>`;
    })
    .join("");
}

const obligationHead = `<tr><th class="item">Obligations and Responsibilities as per CMO No. 104 S. 2017</th>${IMPLEMENTATION_LEVELS.map(
  (l) => `<th>${l.label} (${l.value})</th>`
).join("")}</tr>`;

const levelText = (l: (typeof IMPLEMENTATION_LEVELS)[number]) =>
  `<p class="level"><strong>${l.value} ${l.label}:</strong> This level indicates that ${l.description.replace(/^The item/, "the item")}</p>`;

// SLU's FM-VAA-052, filled in: A4, Century Gothic 10 (Didact Gothic stands in), five pages
// laid out as VPAA's are so "Page n of 5" holds.
export function renderHteEvaluationHtml(data: OwnEvaluationForm): string {
  const dates =
    data.from && data.to
      ? `${formatCalendarDate(data.from)} – ${formatCalendarDate(data.to)}`
      : data.from
        ? `${formatCalendarDate(data.from)} –`
        : null;
  const field = (label: string, value: string | null) =>
    `<p class="field"><strong>${label}:</strong> <span>${escapeHtml(value)}</span></p>`;
  const comment = (letter: string, q: string, a: string | null) =>
    `<div class="comment"><p>${letter}. ${q}</p><p class="answer">${escapeHtml(a)}</p></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${FORM.code} Host Training Establishment (HTE) Evaluation Form</title>
<style>
  ${fontFaces("Century Gothic")}
  @page { size: A4; margin: 0.45in 0.75in 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: "Century Gothic", "Didact Gothic", Arial, sans-serif; font-size: 10pt; color: #000; margin: 0; line-height: 1.45; }
  p { margin: 0 0 9pt; }
  .page { break-after: page; }
  .page:last-child { break-after: auto; }
  table.docbox { margin: 0 0 18pt auto; border-collapse: collapse; font-family: Candara, Calibri, Arial, sans-serif; font-size: 7.5pt; }
  table.docbox td { border: 1px solid #000; padding: 0 6px; width: 1in; }
  h1 { text-align: center; font-size: 12pt; margin: 6pt 0 16pt; }
  .letter { text-align: justify; }
  .field { margin: 0 0 3pt; display: flex; gap: 6px; }
  .field span { flex: 1; border-bottom: 1px solid #000; }
  .level { padding-left: 1.2em; text-indent: -1.2em; margin-bottom: 4pt; }
  table.rate { width: 100%; border-collapse: collapse; margin-top: 14pt; table-layout: fixed; }
  table.rate th, table.rate td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  table.rate th { background: #c6e0b4; text-align: center; font-weight: bold; }
  table.rate td.item { width: 38%; }
  table.rate th.item { width: 38%; }
  table.rate td.mark { text-align: center; vertical-align: middle; }
  .n { display: inline-block; min-width: 1.6em; }
  tr { break-inside: avoid; }
  .comment { margin: 0 0 0.35in 0.3in; }
  .answer { white-space: pre-wrap; margin-left: 1.2em; min-height: 1.4in; }
  .ref { margin-top: 0.3in; font-size: 7.5pt; color: #555; text-align: center; }
</style>
</head>
<body>
<section class="page">
  ${docBox(1)}
  <h1>Host Training Establishment (HTE) Evaluation Form</h1>
  <p><strong>Dear respondents,</strong></p>
  <div class="letter">
    <p>To ensure that our partner HOST TRAINING ESTABLISHMENTS (HTEs) will continue helping us to provide high-quality learning experience that aligns with the educational goals and standards of our programs, may we request you to kindly accomplish this form properly.</p>
    <p>Evaluating HTEs is essential to ensuring that student interns receive meaningful, safe, and relevant training experiences. It promotes continuous improvement, alignment with academic goals, and the protection of student well-being, all of which are critical for the overall success of internship programs.</p>
    <p>Rest assured that your responses to this survey will be treated with the utmost confidentiality. All information collected will be used solely for continuous quality improvement purposes and will be handled in compliance with applicable data privacy laws and regulations. Your responses will not be disclosed to any unauthorized parties, and all results will be reported in an aggregated and anonymized format.</p>
    <p>Thank you for your participation and trust.</p>
    <p>Office of the Vice President for Academic Affairs (VPAA)</p>
  </div>
  <div style="margin-top: 18pt">
    ${field("Name", data.name)}
    <p class="field"><strong>Type of Engagement with the HTE:</strong> <u>&nbsp;&nbsp;<strong>X</strong>&nbsp;&nbsp;</u> Intern &nbsp; ______ Supervisor &nbsp; ______ Department Head</p>
    ${field("SLU email address", data.email)}
    ${field("Name of HTE", data.company.name)}
    ${field("Address of HTE", data.company.address)}
    ${field("Name of HTE Supervisor", data.company.supervisorName)}
    ${field("Dates of Internship", dates)}
  </div>
  <p style="margin-top: 18pt"><strong>Instruction:</strong> Click/check the column that corresponds to your evaluation of the HTE where you had your internship guided by the following descriptions of the levels:</p>
  ${IMPLEMENTATION_LEVELS.slice(0, 2).map(levelText).join("")}
</section>

<section class="page">
  ${docBox(2)}
  ${IMPLEMENTATION_LEVELS.slice(2).map(levelText).join("")}
  <table class="rate">${COLS}<thead>${obligationHead}</thead><tbody>${ratingRows(OBLIGATIONS, data.obligations, 1, 0, 7)}</tbody></table>
</section>

<section class="page">
  ${docBox(3)}
  <table class="rate">${COLS}<tbody>${ratingRows(OBLIGATIONS, data.obligations, 1, 7, 15)}</tbody></table>
</section>

<section class="page">
  ${docBox(4)}
  <table class="rate">${COLS}<tbody>${ratingRows(OBLIGATIONS, data.obligations, 1, 15)}</tbody></table>
  <table class="rate" style="margin-top: 24pt">${COLS}
    <thead><tr><th class="item">Internship Quality</th>${QUALITY_LEVELS.map((l) => `<th>${l.label} (${l.value})</th>`).join("")}</tr></thead>
    <tbody>${ratingRows(QUALITY, data.quality, OBLIGATIONS.length + 1)}</tbody>
  </table>
</section>

<section class="page">
  ${docBox(5)}
  <p><strong>Additional Comments</strong></p>
  ${comment("A", COMMENT_QUESTIONS.liked, data.liked)}
  ${comment("B", COMMENT_QUESTIONS.improve, data.improve)}
  ${comment("C", COMMENT_QUESTIONS.comment, data.comment)}
  <p class="ref">Submitted through IDSMS-CIS on ${escapeHtml(formatInstant(data.submittedAt))}</p>
</section>
</body>
</html>`;
}
