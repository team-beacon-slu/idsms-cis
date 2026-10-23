# Workstream H — Final Technical Report: Implementation Plan

**Spec:** `docs/superpowers/specs/2026-10-21-phase4-final-technical-report-design.md` (approved by Jay 2026-10-21, open questions on their defaults: five sections; the student enters the scores; coordinator-only review).

## Global constraints

- Gate = `getFinalReportThreshold` vs `calculateRenderedHours` (same as the final cover).
- No uploads (D2/D7): attachments are a checklist of what is in Google Classroom.
- Every write audited in its transaction; status-guarded writes (`updateMany` on the expected status) so concurrent edits/reviews can't overwrite each other; notifications after commit.
- Reviewers: DEPARTMENT_COORDINATOR and SUPER_ADMIN. The faculty adviser reads only.
- Migration `010_final_technical_report.sql` (additive): `final_technical_reports` table + `FINAL_TECHNICAL_REPORT` DocumentType value.

## Tasks

1. **Model + validators + pure rules** — `FinalTechnicalReport` model; `src/lib/validators/finalReport.ts` (sections ≤ 10 000 chars each, scores 0 < s ≤ scale, scale 1–100, attachments booleans); `submitProblems(report)` pure check (+tests).
2. **Service** — `src/lib/services/finalReportService.ts`: `getFinalReportState` (gate + report), `saveFinalReportDraft` (owner, DRAFT/RETURNED only), `submitFinalReport` (gate, `submitProblems` empty, → SUBMITTED, notify coordinators), `reviewFinalReport` (confirm attachments, APPROVE needs all confirmed, RETURN needs a note, → notify student), `listFinalReportsAwaitingReview` (+tests).
3. **API** — `api/students/[id]/final-report` (GET, PUT draft), `.../final-report/submit` (POST), `api/final-reports/[id]/review` (POST), `api/final-reports/[id]/pdf` (GET, approved only).
4. **UI** — `/final-report` redirect, `students/[id]/final-report` page (gate / editor / review panel), `/final-reports` coordinator list, nav items, coordinator dashboard count.
5. **PDF** — `finalReportTemplate.ts` (cover page from WS-E + sections, scores, attachment list, escaping, preview watermark) + generation through `renderAndStoreDocument` (+tests). Full gate incl. `next build`.
