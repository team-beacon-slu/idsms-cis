# Workstream H — Final Technical Report (PRD Module 7): Design

**Status:** draft for Jay's approval (2026-10-21).
**Source:** PRD Module 7 (FR-FT-01..03), Phase 4 roadmap row H.
**Revisit:** when SLU's official final report template arrives, swap the section list and PDF layout. The data model below is section-based so that is a content change, not a rebuild.

## Intent

A student who has rendered enough confirmed hours writes their Final Technical Report in IDSMS. The department coordinator approves it or returns it with a note. Once approved, the student gets a PDF of the report with the existing final cover page (WS-E) on top, and submits that through Google Classroom.

## Requirements (PRD)

| ID       | Requirement                                                                                                                                                                   | How H meets it                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-FT-01 | Accessible only after a configurable hour threshold (e.g. 500 of 600 for BSIT).                                                                                               | Reuses `getFinalReportThreshold` and `calculateRenderedHours` (credited hours, L1) — the same gate as the final cover page. Below it, the page shows "N more hours to go". |
| FR-FT-02 | Sections: company profile summary, peer and supervisor evaluation scores, proof of attachments (attendance proof, certificates of completion, certificates of participation). | Text sections + score fields, and a **status-only** attachments checklist (see D2/D7 below).                                                                               |
| FR-FT-03 | Reviewed and approved or returned by the department coordinator.                                                                                                              | Coordinator (and Super Admin) Approve / Return-with-note, same pattern as the L1 request review.                                                                           |

## Decisions that shape H

- **D2/D7 (Jay, 2026-10-11/12): IDSMS stores no signed or sensitive documents.** FR-FT-02's "proof of attachments" therefore becomes a **checklist of what the student attached in Google Classroom** (attendance proof, certificate of completion from the HTE, certificate of attendance from the CPO, certificates of participation), each marked by the student and confirmed by the coordinator. No file upload anywhere.
- **Company profile summary** is pre-filled from the `Company` record (name, address, work modality, supervisor) and the student's position title; the student adds a free-text overview of the company and their department.
- **Evaluation scores are entered, not computed.** SLU's supervisor and peer evaluation forms are paper / Google Forms today. The student (or coordinator) records the supervisor's overall score and the peer evaluation average as numbers with their scale (e.g. 4.5 / 5). The forms themselves go to Google Classroom.
- **One report per student.** It is editable while Draft or Returned, locked while Submitted or Approved.

## Data (migration 009, additive)

`FinalTechnicalReport` (one per `studentProfileId`, unique):

| Column                               | Type                                                             | Notes                                                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                 | uuid                                                             |                                                                                                                                                                                              |
| `studentProfileId`                   | uuid, unique                                                     |                                                                                                                                                                                              |
| `status`                             | enum `FinalReportStatus` DRAFT / SUBMITTED / APPROVED / RETURNED |                                                                                                                                                                                              |
| `sections`                           | Json                                                             | `{ companyOverview, introduction, workAccomplished, learnings, recommendations }` — each a trimmed string, ≤ 10 000 chars. Section keys are the place to change when SLU's template arrives. |
| `supervisorScore`, `supervisorScale` | Decimal(4,2), Int                                                | e.g. 4.5 / 5; both nullable until entered                                                                                                                                                    |
| `peerScore`, `peerScale`             | Decimal(4,2), Int                                                |                                                                                                                                                                                              |
| `attachments`                        | Json                                                             | `{ attendanceProof, certificateOfCompletion, certificateOfAttendance, certificatesOfParticipation }` → each `{ attached: boolean, confirmed: boolean }`                                      |
| `reviewNote`                         | text                                                             | the coordinator's note on Return                                                                                                                                                             |
| `submittedAt`, `reviewedAt`          | timestamptz                                                      |                                                                                                                                                                                              |
| `reviewedById`                       | uuid                                                             |                                                                                                                                                                                              |
| `createdAt`, `updatedAt`             | timestamptz                                                      |                                                                                                                                                                                              |

Every write is audited (`FINAL_REPORT_SAVED` / `_SUBMITTED` / `_APPROVED` / `_RETURNED`). The file-retention scan (WS-G) does not apply: there are no files.

## Flow

1. **Locked** (below threshold): the student sees the gate and their remaining hours.
2. **Draft:** the student fills the sections, scores and attachment checklist; saves any time.
3. **Submit** requires: every section non-empty, both scores entered (0 < score ≤ scale), and every attachment marked attached. Status → SUBMITTED; the coordinator is notified.
4. **Coordinator review** (DEPARTMENT_COORDINATOR or SUPER_ADMIN): sees the report, ticks "confirmed" per attachment after checking Google Classroom, then:
   - **Approve** (all attachments confirmed) → APPROVED, student notified.
   - **Return** with a required note → RETURNED, student notified, editable again.
5. **PDF:** once APPROVED, "Download final report" renders the final cover (WS-E template) + the report sections, scores and attachment list through the existing Puppeteer pipeline (`renderAndStoreDocument`, new `DocumentType FINAL_TECHNICAL_REPORT`), with a reference code and Manila timestamp. A preview (watermarked) is available any time.

## Screens

- **Student:** `/final-report` → `/students/[id]/final-report` (nav item appears for students). Gate / editor / status banner with the coordinator's note.
- **Coordinator:** a "Final reports awaiting review" count on the dashboard and a list page `/final-reports` (student, program, submitted date), linking to the same student page in review mode.
- **Faculty adviser:** read-only view from My Students.

## Out of scope

- Uploading any file (D2/D7).
- Computing evaluation scores from individual criteria; the AI (WS-D) sentiment on the report text.
- A faculty-adviser approval step (PRD names only the coordinator).

## Testing (TDD)

- Gate: below / at threshold (credited hours), legacy rows.
- Submit validation: empty section, missing or out-of-range score, unattached item.
- Review: role checks, Approve blocked until all attachments confirmed, Return needs a note, status-guarded writes (no lost updates, same as L1).
- PDF loader + template: sections, scores, attachment list, escaping, preview watermark.

## Open questions (defaults used until answered)

1. Does SLU have an official final report outline? **Default:** the five sections above.
2. Who enters the evaluation scores — student or coordinator? **Default:** the student enters them; the coordinator sees them during review.
3. Should the faculty adviser also sign off before the coordinator? **Default:** no (PRD: coordinator only).
