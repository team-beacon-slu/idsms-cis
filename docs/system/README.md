# IDSMS-CIS system documentation

_SAMCIS Internship Document Submission and Monitoring System, Saint Louis University. Last updated: 13 October 2026._

> **Status of this documentation: working draft for adviser review.**
> The whole app flow is still in the development stage. Most of the flows and rules described here are the project manager's interpretation of SLU's internship instructions (orientation slides, guidelines and faculty answers), not yet confirmed by the adviser. **Any part may change on the adviser's instructions, including parts that are already built** (for example the status-only checklist, the endorsement gate and the hours rules). "Built" means "works in the current build", not "final". Decisions and open questions are listed in [11](11-decisions-and-open-questions.md).

This folder explains how the IDSMS-CIS website works: what it is for, who uses it, the rules it enforces, how it is built and what is still being built. It is written for the project adviser, department heads, faculty, the internship coordinator, the IT office and future maintainers.

For a 2-page summary of status, decisions and open questions, start with the [Adviser briefing](../ADVISER_BRIEFING.md).

## How to read status labels

Every feature in these documents carries one of three labels:

| Label           | Meaning                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Built**       | Merged into the `develop` branch, code-reviewed and covered by automated tests. Usable today.     |
| **In progress** | Designed and approved, being built now (Workstream L1). Not available yet.                        |
| **Planned**     | Agreed for a later workstream or phase. Not available yet, and details may change before release. |

## Documents

| #   | Document                                                           | What it covers                                                                                                         | Who should read it                                            |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 01  | [Product overview](01-product-overview.md)                         | Purpose, the problem at SAMCIS, users, goals, scope, modules with status and PRD requirement IDs, constraints          | Everyone; start here                                          |
| 02  | [Internship lifecycle](02-internship-lifecycle.md)                 | The end-to-end journey from account creation to completion, with a flowchart and who does what at each step            | Adviser, department heads, faculty, coordinator               |
| 03  | [User guide: student intern](03-user-guide-student.md)             | Every screen a student sees, what it shows, what they can do, rules and tips                                           | Students; faculty who support them                            |
| 04  | [User guide: faculty adviser](04-user-guide-faculty.md)            | Dashboard, My Students, checklist review, weekly report review, endorsement letters, exports                           | Faculty advisers                                              |
| 05  | [User guide: department coordinator](05-user-guide-coordinator.md) | Department dashboard, users and bulk import, companies and MOAs, work plans, semesters                                 | Internship coordinator, department head                       |
| 06  | [User guide: Super Admin](06-user-guide-super-admin.md)            | Users and roles, settings, semesters, audit log, Export Center, data requests, file retention                          | System administrator, IT office                               |
| 07  | [Business rules](07-business-rules.md)                             | Every rule the system enforces, with its source (PRD, SLU slide or decision)                                           | Adviser, faculty, coordinator, maintainers                    |
| 08  | [Technical design](08-technical-design.md)                         | Architecture, stack, API routes, data model, security internals, PDFs, jobs, migrations, testing, deployment           | IT office, maintainers, developers                            |
| 09  | [Security and privacy](09-security-and-privacy.md)                 | Data Privacy Act (RA 10173) measures: access control, audit log, no sensitive documents, data requests, retention      | Adviser, department heads, IT office, data protection officer |
| 10  | [Roadmap and status](10-roadmap-and-status.md)                     | Workstreams with status and PR numbers, what comes next, deferred items                                                | Adviser, department heads, project team                       |
| 11  | [Decisions and open questions](11-decisions-and-open-questions.md) | Decisions already made, and the numbered questions for the adviser                                                     | Adviser (please answer by number)                             |
| 12  | [Glossary](12-glossary.md)                                         | Terms and abbreviations (HTE, MOA, DTR, WWR, OT/UT, DSAR, RLS and more)                                                | Everyone                                                      |
| 13  | [App flow](13-app-flow.md)                                         | Screen map per role, user flows, state diagrams of each record, key sequences, where flows may change                  | Adviser, faculty, coordinator, designers, maintainers         |
| 14  | [Data schema](14-data-schema.md)                                   | Every table, enum and JSON field, database protections, storage layout, planned schema changes                         | IT office, maintainers, data protection officer               |
| 15  | [Design brief](15-design-brief.md)                                 | Brand and tone, colour and type tokens, layout, components, interaction patterns, accessibility, PDFs, recommendations | Designers, front-end maintainers, adviser                     |

## Suggested reading paths

- **Project adviser:** [Adviser briefing](../ADVISER_BRIEFING.md), then 01, 02, 13 (section 5, "Where flows may change"), 07 and 11.
- **Department head or dean:** 01, 02, 09 and 10.
- **Faculty adviser:** 02, 04, 13 and 07.
- **Internship coordinator:** 02, 05, 13 and 07.
- **Students:** 03 (and 07 for the hours and deadline rules).
- **Designers:** 15, then 13.
- **IT office or future maintainer:** 08, 14, 09 and 06, then 13, the source code and `PRD.md`.

## Sources of truth

These documents summarise, and must stay consistent with:

- `PRD.md`: product requirements (the `FR-` and `NFR-` IDs cited throughout).
- `docs/superpowers/plans/` and `docs/superpowers/specs/`: the roadmap and per-workstream designs.
- The code itself (`prisma/schema.prisma`, `src/app`, `src/lib`), which is the final word on what is built.

If a document here disagrees with the code, the code is right and the document should be corrected.
