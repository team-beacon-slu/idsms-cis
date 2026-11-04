// Workstream H: the Final Technical Report PDF in SLU's outline (Technical Report
// template): title page, table of contents, then Company Profile, Company Resources,
// Internship Program, Assessment and Appendix, each on a new page. Pure: same input,
// same HTML.
import {
  reportCss,
  renderFinalCoverSection,
  type FinalCoverData,
} from "@/lib/documents/finalCoverTemplate";
import { escapeHtml, formatCalendarDate } from "@/lib/documents/html";
import {
  ATTACHMENT_KEYS,
  ATTACHMENT_LABELS,
  rows,
  SELF_ITEMS,
  sentence,
  WORK_SKILLS,
  type Assessment,
} from "@/lib/validators/finalReport";

export interface FinalReportDocumentData {
  cover: FinalCoverData;
  basics: {
    office: string | null;
    start: Date | null;
    end: Date | null;
  };
  sections: Partial<Record<string, string>>;
  assessment: Assessment;
  attachments: Partial<Record<string, boolean>>;
}

const text = (s: string | undefined) => `<p class="text">${escapeHtml(s)}</p>`;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SKILL_LETTERS = "abcdefghijklmnopqrstuvwxyz";

function lettered(title: string, items: string[]) {
  const body = (items.length ? items : [""])
    .map(
      (r, i) =>
        `<tr><td class="letter">${LETTERS[i]}</td><td class="text">${escapeHtml(r || null)}</td></tr>`
    )
    .join("");
  return `<table class="grid"><thead><tr><th colspan="2"><strong>${title}</strong></th></tr></thead><tbody>${body}</tbody></table>`;
}

const rated = (v: number | null) => (v == null ? "" : String(v));

// The table of contents' page cells (data-toc) are filled by renderHtmlToPdf, which
// counts each section's pages exactly.
export function renderFinalReportHtml(data: FinalReportDocumentData): string {
  const s = data.sections;
  const a = data.assessment;
  const b = data.basics;
  const remarks = (key: string) =>
    s[key]?.trim()
      ? `<tr><td colspan="2"><strong>Remarks:</strong> <span class="text">${escapeHtml(s[key])}</span></td></tr>`
      : "";

  const workRows =
    WORK_SKILLS.map(
      (skill, i) =>
        `<tr><td class="indent">${SKILL_LETTERS[i]}) ${skill}</td><td class="num">${rated(a.work[i])}</td></tr>`
    ).join("") +
    a.others
      .map(
        (o, i) =>
          `<tr><td class="indent">${SKILL_LETTERS[WORK_SKILLS.length + i]}) Others: ${escapeHtml(o.label)}</td><td class="num">${o.rating}</td></tr>`
      )
      .join("");
  const selfRows = SELF_ITEMS.map(
    (item, i) =>
      `<tr><td class="indent">${SKILL_LETTERS[i]}) ${item}</td><td class="num">${rated(a.self[i])}</td></tr>`
  ).join("");

  const toc = [
    ["company-profile", "Company Profile"],
    ["company-resources", "Company Resources"],
    ["internship-program", "Internship Program"],
    ["assessment", "Assessment"],
    ["appendix", "Appendix"],
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Technical Report ${escapeHtml(data.cover.student.fullName)}</title>
<style>${reportCss()}
  html { width: 6.5in; }
  @page { @bottom-center { content: counter(page); font-family: Cambria, Caladea, serif; font-size: 11pt; } }
  @page :first { @bottom-center { content: none; } }
  section.sheet { break-before: page; }
  h1 { font-size: 12pt; text-transform: uppercase; margin: 0 0 12pt; }
  h2 { font-size: 12pt; margin: 12pt 0 4pt; }
  h3 { font-size: 12pt; font-weight: normal; margin: 8pt 0 2pt 0.25in; }
  .text { white-space: pre-wrap; text-align: justify; }
  .block { margin-left: 0.25in; }
  table.grid { width: 100%; border-collapse: collapse; margin: 6pt 0 14pt; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 3pt 6pt; vertical-align: top; text-align: left; font-weight: normal; }
  table.grid td.letter { width: 0.45in; text-align: center; }
  table.grid td.num { width: 0.9in; text-align: center; }
  table.grid td.indent { padding-left: 0.3in; }
  table.info td:first-child { width: 2.4in; font-weight: bold; }
  .scale { background: #e7e6e6; font-size: 10pt; }
  table.toc { width: 100%; border-collapse: collapse; }
  table.toc td { padding: 3pt 0; }
  table.toc td.page { text-align: right; width: 0.6in; }
  ul.appendix { padding-left: 0.25in; }
  tr { break-inside: avoid; }
</style>
</head>
<body>
${renderFinalCoverSection(data.cover)}

<section class="sheet" id="toc">
  <h1>Table of Contents</h1>
  <table class="toc">${toc.map(([id, label]) => `<tr><td>${label}</td><td class="page" data-toc="${id}"></td></tr>`).join("")}</table>
</section>

<section class="sheet" id="company-profile">
  <h1>Company Profile</h1>
  <h2>1. Basic Information</h2>
  <table class="grid info">
    <tr><td>Company Name</td><td>${escapeHtml(data.cover.company?.name)}</td></tr>
    <tr><td>Department/Area/Office</td><td>${escapeHtml(b.office)}</td></tr>
    <tr><td>Supervising Personnel - Designation</td><td class="text">${escapeHtml(s.supervisors)}</td></tr>
    <tr><td>Start Date</td><td>${escapeHtml(b.start && formatCalendarDate(b.start))}</td></tr>
    <tr><td>End Date</td><td>${escapeHtml(b.end && formatCalendarDate(b.end))}</td></tr>
  </table>
  <h2>2. Company Description</h2>
  ${text(s.companyDescription)}
  <h2>3. Office Environment/Culture</h2>
  ${text(s.officeCulture)}
</section>

<section class="sheet" id="company-resources">
  <h1>Company Resources</h1>
  <h2>1. Hardware</h2>
  <div class="block">
    <h3>A. Company-Wide</h3>${text(s.hardwareCompany)}
    <h3>B. At Work</h3>${text(s.hardwareWork)}
  </div>
  <h2>2. Software</h2>
  <div class="block">
    <h3>A. Operating Systems</h3>${text(s.softwareOs)}
    <h3>B. Productivity Tools</h3>${text(s.softwareProductivity)}
    <h3>C. Software Development Tools and Technologies</h3>${text(s.softwareDevTools)}
    <h3>D. Others</h3>${text(s.softwareOthers)}
  </div>
</section>

<section class="sheet" id="internship-program">
  <h1>Internship Program</h1>
  ${lettered("1. Task List", rows(s.tasks))}
  ${lettered("2. Main Accomplishment(s)", rows(s.accomplishments))}
  ${lettered("3. Challenges Faced", rows(s.challenges))}
  <table class="grid">
    <thead><tr><th colspan="2"><strong>4. Learning / Growth</strong></th></tr></thead>
    <tbody>
      ${[
        ["Personality and/or Social Aspect", s.learningPersonality],
        ["Technical Knowledge and/or Skills", s.learningTechnical],
        ["Other Professional Skills", s.learningOtherProfessional],
        ["Professional Work", s.learningProfessionalWork],
      ]
        .map(
          ([label, body], i) =>
            `<tr><td class="letter">${LETTERS[i]}</td><td><strong>${label}</strong><br /><span class="text">${escapeHtml(body)}</span></td></tr>`
        )
        .join("")}
    </tbody>
  </table>
</section>

<section class="sheet" id="assessment">
  <h1>Assessment</h1>
  <table class="grid">
    <thead>
      <tr><th colspan="2"><strong>1. Work Assessment</strong></th></tr>
      <tr><td colspan="2">For each item, the number corresponding to my rating of the following in relation to my internship experience.</td></tr>
      <tr><td colspan="2" class="scale">Rating Scale: <strong>Extensive = 4, Adequate/Sufficient = 3, Occasional = 2, Rare to None = 1</strong></td></tr>
      <tr><th>Item</th><th class="num">Rating</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>On the opportunity you were provided to employ or enhance the following:</strong></td><td></td></tr>
      ${workRows}
      <tr><td><strong>On the management and guidance provided by your supervisor</strong></td><td class="num">${rated(a.supervisorGuidance)}</td></tr>
      <tr><td><strong>On the coordination and communication of the people you work with</strong></td><td class="num">${rated(a.coworkers)}</td></tr>
      ${remarks("workRemarks")}
    </tbody>
  </table>
  <table class="grid">
    <thead>
      <tr><th colspan="2"><strong>2. Self-Assessment</strong></th></tr>
      <tr><td colspan="2">For each item, the number corresponding to my rating of my performance as an intern.</td></tr>
      <tr><td colspan="2" class="scale">Rating Scale: <strong>Very Good = 4, Good = 3, Acceptable = 2, Poor = 1</strong></td></tr>
      <tr><th>Item</th><th class="num">Rating</th></tr>
    </thead>
    <tbody>${selfRows}${remarks("selfRemarks")}</tbody>
  </table>
  <table class="grid">
    <thead><tr><th><strong>3. Miscellany</strong></th></tr></thead>
    <tbody>
      <tr><td class="indent"><strong>a) Areas for improvement</strong><br /><span class="text">${escapeHtml(s.areasForImprovement)}</span></td></tr>
      <tr><td class="indent"><strong>b) Program</strong><br /><span class="text">${escapeHtml(s.programFeedback)}</span></td></tr>
    </tbody>
  </table>
</section>

<section class="sheet" id="appendix">
  <h1>Appendix</h1>
  <p>Submitted with this report in Google Classroom:</p>
  <ul class="appendix">
    ${ATTACHMENT_KEYS.map((k) => `<li>${sentence(ATTACHMENT_LABELS[k])}${data.attachments[k] ? "" : " (not yet attached)"}</li>`).join("")}
  </ul>
  <p style="margin-top: 12pt; font-size: 9pt">${escapeHtml(data.cover.referenceCode)} · IDSMS-CIS</p>
</section>
</body>
</html>`;
}
