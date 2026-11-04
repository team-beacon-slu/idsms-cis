import { escapeHtml } from "@/lib/documents/html";
import { fontFaces } from "@/lib/documents/fonts";

export interface WaiverData {
  student: { name: string; program: string };
  company: { name: string; address: string } | null;
  term: string; // "First Semester, SY 2026-2027"
}

const PROGRAM: Record<string, string> = {
  BSIT: "Information Technology",
  BSCS: "Computer Science",
  BMMA: "Multimedia Arts",
};

const HEADER = `
  <header>
    <p><strong>SAINT LOUIS UNIVERSITY</strong></p>
    <p><strong>School of Accountancy, Management, Computing and Information Studies</strong></p>
    <p><strong>Information Technology-MMA/Computer Science-CAD Department</strong></p>
    <p><strong>Baguio city</strong></p>
  </header>`;

const blank = (value: string | null | undefined, width = "3.4in") =>
  value
    ? `<span class="fill">${escapeHtml(value)}</span>`
    : `<span class="blank" style="width:${width}"></span>`;

// SAMCIS's "Internship Program Parental Consent and Undertaking" (Company Based OJT Waiver):
// the guidelines (pages 1-2) and the consent, waiver and undertaking page, with what IDSMS
// knows filled in. US Letter, Calibri, as SLU's own PDF. Print two copies of page 3 (one for
// the HTE, one signed by the HTE and submitted to SAMCIS), as its note says.
export function renderWaiverHtml(d: WaiverData): string {
  const hte = d.company?.name ?? null;
  const program = PROGRAM[d.student.program] ?? d.student.program;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Parental Consent and Undertaking ${escapeHtml(d.student.name)}</title>
<style>
  ${fontFaces("Calibri")}
  @page { size: Letter; margin: 0.5in 0.7in; }
  body { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 10.5pt; color: #000; margin: 0; line-height: 1.3; }
  p { margin: 0 0 5pt; }
  header { text-align: center; font-size: 9.5pt; margin-bottom: 8pt; }
  header p { margin: 0; }
  .bar { background: #000; color: #fff; text-align: center; font-weight: bold; padding: 3pt; margin: 6pt 0 8pt; font-size: 11pt; }
  ol, ul { margin: 2pt 0 6pt; padding-left: 1.6em; }
  li { margin-bottom: 2pt; }
  .page { break-after: page; }
  .foot { text-align: center; font-size: 9pt; margin-top: 18pt; }
  .fill { border-bottom: 1px solid #000; padding: 0 4pt; font-weight: bold; }
  .blank { display: inline-block; border-bottom: 1px solid #000; height: 12pt; vertical-align: bottom; }
  .sig { display: grid; grid-template-columns: 3.2in 1fr 1.6in; margin-top: 26pt; text-align: center; font-size: 9.5pt; }
  .sig div:first-child, .sig div:last-child { border-top: 1px solid #000; padding-top: 2pt; }
  .center { text-align: center; }
  .note { border: 1px solid #000; padding: 4pt 6pt; font-size: 9.5pt; margin-top: 14pt; }
</style>
</head>
<body>
<section class="page">
  ${HEADER}
  <div class="bar">Internship Program Parental Consent and Undertaking</div>
  <p><strong>BASIC GUIDELINES:</strong></p>
  <p><strong>I.</strong> Students must undergo on-the-job training as an intern at a Host Training Establishment as part of the requirements for the courses <strong>BS Computer Science (BSCS)</strong>, <strong>BS Information Technology (BSIT)</strong>, and <strong>Bachelor of Multimedia Arts (BMMA).</strong> A Practicum Course is offered for this purpose.</p>
  <p>The Practicum Course is intended to provide the students with the opportunity to:</p>
  <ol>
    <li>learn about the actual work environment and practices in the industry</li>
    <li>enhance and/or apply one’s theoretical knowledge and skills in the field</li>
    <li>demonstrate professionalism, productivity, creativity and initiative in the workplace</li>
    <li>utilize ICT hardware and software used in the industry</li>
    <li>learn about the various phases of software development in a real-world setting</li>
    <li>layout, design, and produce deliverables on publications, video productions, animation and motion graphics, social media contents, and photography</li>
    <li>improve soft skills such as communication, collaboration, time management, and adaptability</li>
  </ol>
  <p><strong>II. Participants</strong></p>
  <ol><li>STUDENT</li><li>SAMCIS (School of Accountancy, Management, Computing and Information Studies)</li><li>HTE (Host Training Establishment)</li></ol>
  <p><strong>III. Academic Units and Duration.</strong> Note that hours may be extended as required and approved by all participants, in order to complete the program.</p>
  <ol><li>BSIT- 9 units: 600 hours</li><li>BSCS - 6 units: 240 - 320 hours</li><li>BMMA - 3 units - 500 hours</li></ol>
  <p><strong>IV. Responsibilities</strong></p>
  <p>1. STUDENT:</p>
  <ol type="a">
    <li>Apply as a trainee in the desired HTE and process the necessary paperwork required for the internship (Endorsement, Consent Form, MOA) in accordance to the guidelines provided by SAMCIS.</li>
    <li>Since the STUDENT will be in an actual work environment, the STUDENT is expected to complete the internship, fulfill assigned tasks and comply with company/office guidelines.</li>
    <li>Submit the Weekly Work Report and other pertinent documents to SAMCIS through an assigned adviser.</li>
    <li>Monitor announcements through the Google Classroom created by SAMCIS and maintain communication with the assigned adviser.</li>
    <li>Provide a notification of retraction (to be noted by SAMCIS) should it be necessary for the STUDENT to stop working at the HTE for any reason.</li>
    <li>Accomplish the terminal requirements for the course.</li>
  </ol>
  <p class="foot">Guidelines</p>
</section>

<section class="page">
  ${HEADER}
  <p>2. SAMCIS:</p>
  <ol type="a">
    <li>Process the placement of the students by providing a list of potential HTEs, endorse the students to the HTE, provide templates for pertinent documents and prepare the MOA.</li>
    <li>Assign an adviser for the STUDENT and ensure that the adviser monitors the STUDENT’s training and accomplishes the grades of the student based on the grading guidelines for the course.</li>
    <li>Communicate with the students and the HTE regarding relevant information and announcements regarding specific details of the internship program.</li>
    <li>Conduct a company visit prior to the completion of the internship period.</li>
    <li>Provide the tool that will be accomplished by the HTE in evaluating the STUDENT intern.</li>
  </ol>
  <p>3. HTE:</p>
  <ol type="a">
    <li>Provide the necessary training to the STUDENT based on a practical internship plan.</li>
    <li>Mentor, supervise and monitor the STUDENT during the internship period.</li>
    <li>Orient the STUDENT on the rules and regulations of the HTE.</li>
    <li>Facilitate the processing of documents of the STUDENT in coordination with SAMCIS.</li>
    <li>Inform SAMCIS of any issues that require attention or intervention in relation to the performance of the STUDENT intern.</li>
    <li>Accomplish the evaluation form, which will constitute part of the grade of the STUDENT for the course.</li>
    <li>Issue a Certificate of Completion to the STUDENT after the internship has been completed.</li>
  </ol>
  <p class="foot">Guidelines</p>
</section>

<section>
  ${HEADER}
  <div class="bar">Parental Consent / Waiver</div>
  <p class="center"><strong>PARENT’S/GUARDIAN’S APPROVAL and CONSENT</strong></p>
  <p class="center">I, ${blank(null)},</p>
  <p class="center">have read the guidelines on the Internship Program and hereby allow my child/ward,</p>
  <p class="center">${blank(d.student.name)}</p>
  <p class="center">to participate in the Practicum Course as an intern of</p>
  <p class="center">${blank(hte)},</p>
  <p class="center">(<strong><em>name of Host Training Establishment</em></strong>)<br />located at</p>
  <p class="center">${blank(d.company?.address ?? null, "5in")}</p>
  <p class="center">(<strong><em>address of Host Training Establishment</em></strong>)<br />for the prescribed number of hours.</p>
  <p style="text-align:justify">I agree to waive any claims and actions against the School of Accountancy, Management, Computing and Information Studies (SAMCIS) of Saint Louis University, ${blank(hte, "2.4in")}, any representative of Saint Louis University and any representative of ${blank(hte, "2.4in")} in case of any untoward incident that may happen to my child/ward during the internship period.</p>
  <p style="text-align:justify">I understand that the representatives of SAMCIS, Saint Louis University and ${blank(hte, "2.4in")} shall exercise due diligence and attention in ensuring the safety and well-being of my child/ward during the conduct of the internship.</p>
  <div class="sig"><div>Parent’s/Guardian’s Signature over printed name</div><span></span><div>Date</div></div>

  <div class="bar" style="margin-top:14pt">Undertaking of Student</div>
  <p style="text-align:justify">I, ${blank(d.student.name)}, a student of SAMCIS enrolled in the program Bachelor of Science in ${blank(program, "2.2in")}, have read and understood the provisions regarding my enrollment in the Practicum Course for the ${blank(d.term, "2.2in")} and my internship at ${blank(hte, "2.4in")}. I shall faithfully observe and follow the above provisions, comply with pertinent university and HTE policies and guidelines, as well as commit to achieving the objectives of the course.</p>
  <div class="sig"><div>Student’s Signature over Printed Name</div><span></span><div>Date</div></div>

  <p style="margin-top:14pt;border-bottom:1.5px solid #000"><em>For company personnel only:</em></p>
  <p>Received:</p>
  <div class="sig"><div>Signature over Printed Name</div><span></span><div>Date</div></div>
  <div class="note">Prepare two copies of this page (duly signed by the student and guardian).<br />
    <strong><em>Copy 1</em></strong>: HTE copy<br />
    <strong><em>Copy 2</em></strong>: To be signed by the HTE personnel on the lower portion and submitted by the student to SAMCIS</div>
  <p class="foot">Waiver and Undertaking</p>
</section>
</body>
</html>`;
}
