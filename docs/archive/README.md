# Archive

These are the plans, designs and trackers the team wrote **before** building each part of IDSMS-CIS. Every one of them has been carried out. They are kept as a record of how and why things were built, for the capstone write-up and for future maintainers.

**They are history, not the current truth.** File paths, screen names and statuses inside them may be out of date. For how the system works today, read [`docs/system/`](../system/README.md); if an archived plan and the code disagree, the code is right.

## Plans (by date)

| Date        | Plan                                                                                | What it covered                                                                   | Result                      |
| ----------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| 26 Aug 2026 | [Phase 3 framework](plans/2026-08-26-phase3-framework.md)                           | Attendance, weekly and monthly reports, unified calendar                          | Built (PR #75, #76)         |
| 10 Oct 2026 | [Intern side completion](plans/2026-10-10-intern-side-completion.md)                | Finishing every student screen                                                    | Built (PR #64)              |
| 11 Oct 2026 | [Phase 4 roadmap](plans/2026-10-11-phase4-roadmap.md)                               | The umbrella plan for Phase 4 and its workstreams                                 | Done; see the roadmap doc   |
| 11 Oct 2026 | [Phase 4 execution plan](plans/2026-10-11-phase4-execution-plan.md)                 | Priorities, estimates, owners and sprints for Phase 4 (never committed until now) | Done                        |
| 11 Oct 2026 | [Workstream A: report PDFs](plans/2026-10-11-phase4-pdf-generation.md)              | Server-generated weekly and monthly report PDFs with reference codes              | Built (#78)                 |
| 11 Oct 2026 | [Workstream B: report flow](plans/2026-10-11-phase4-report-flow.md)                 | Confirmed vs pending hours, per-day attendance status                             | Built (#79)                 |
| 11 Oct 2026 | [Workstream C: notifications](plans/2026-10-11-phase4-notifications.md)             | In-app inbox, bell, triggers, daily reminders, email                              | Built (#82)                 |
| 11 Oct 2026 | [Workstream D: AI advisory](plans/2026-10-11-phase4-ai-advisory.md)                 | Similarity and sentiment hints for faculty                                        | Built, off by default (#90) |
| 11 Oct 2026 | [Workstream E: endorsement letters](plans/2026-10-11-phase4-endorsement-letters.md) | Endorsement letter and final report cover PDFs                                    | Built (#81)                 |
| 11 Oct 2026 | [Workstream F: dashboards](plans/2026-10-11-phase4-dashboards.md)                   | Role dashboards, Excel exports, semester archiving                                | Built (#83)                 |
| 12 Oct 2026 | [Workstream G: compliance](plans/2026-10-12-phase4-compliance.md)                   | Export Center, data requests, file retention, append-only audit log               | Built (#84)                 |
| 12 Oct 2026 | [Workstream L1: leave and time](plans/2026-10-12-phase4-leave-time-L1.md)           | Leave and time requests, SLU weekly report, credited hours                        | Built (#87)                 |
| 21 Oct 2026 | [Workstream L2: deductions](plans/2026-10-21-phase4-deductions-L2.md)               | Conduct records, deduction matrix and tally                                       | Built (#88)                 |
| 21 Oct 2026 | [Workstream H: final report](plans/2026-10-21-phase4-final-report-H.md)             | Final technical report                                                            | Built (#89)                 |
| 23 Oct 2026 | [Completeness and identity](plans/2026-10-23-completeness-identity-plan.md)         | Research and plan for names, account menu, legal pages, help, laws-of-UX pass     | Built (#107–#112)           |

## Designs

| Design                                                                                                     | Workstream |
| ---------------------------------------------------------------------------------------------------------- | ---------- |
| [Phase 3: attendance, reports and calendar](specs/2026-08-26-phase3-attendance-reports-calendar-design.md) | Phase 3    |
| [Compliance](specs/2026-10-12-phase4-compliance-design.md)                                                 | G          |
| [Leave and time requests](specs/2026-10-12-phase4-leave-time-requests-design.md)                           | L1         |
| [Final technical report](specs/2026-10-21-phase4-final-technical-report-design.md)                         | H          |

## Other records

| File                                                                     | What it is                                                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [PHASE3_TASKS.md](PHASE3_TASKS.md)                                       | Phase 3 task tracker with owners per function (all done)                                                                                      |
| [design-system-master-2026-08-27.md](design-system-master-2026-08-27.md) | An early generated design-system proposal (dark theme, Fira fonts) that was **not** adopted; see [design brief](../system/15-design-brief.md) |
