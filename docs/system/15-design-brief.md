# 15. Design brief

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 23 October 2026. Audience: designers, front-end maintainers, the adviser. Items labelled **Recommendation (not built)** are suggestions, not current behaviour._

This brief describes the IDSMS-CIS user interface as built (Next.js 16, Tailwind CSS 4, shadcn/ui components, and the BEACON identity from PRs #104, #106 and #107) and the rules new screens should follow. Sources: `src/app/globals.css` (all tokens), `src/app/layout.tsx`, `src/components/**`, `src/app/(dashboard)/**`, `src/lib/documents/**`.

## 1. Purpose and audiences

IDSMS is an institutional work tool for SAMCIS, Saint Louis University. People use it to finish a task correctly and get back to work, not to browse.

| Audience         | Typical device and context                                                    | What the UI must do for them                                                                    |
| ---------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Student interns  | Phone or laptop, often at the host company, weekly, near the Tuesday deadline | Make the next action obvious; prevent mistakes before submitting; show hours and status plainly |
| Faculty advisers | Laptop, in batches (reviewing many reports)                                   | Scan who needs attention; review quickly; never lose a decision                                 |
| Coordinator      | Desktop                                                                       | Department overview, filters, exports                                                           |
| Super Admin      | Desktop                                                                       | Safe handling of sensitive actions (password re-check, clear consequences)                      |

## 2. Brand and tone

- **Institutional and trustworthy:** SLU SAMCIS context; calm navy and slate colours; no decorative imagery; no emoji in the UI.
- **Plain, specific language:** say what happened and what to do next ("A note is required when returning an item").
- **Honest status:** never suggest something is done when it is pending (for example "+8 hrs pending review" next to confirmed hours).
- **BEACON identity:** a lighthouse mark (`components/brand-mark.tsx`) and a slow lighthouse-beam light on the home hero, which stays still when the user prefers reduced motion. The PDF letterhead stays a plain text letterhead until SLU supplies its official one.

## 3. Design principles

1. **Status first.** Every record shows its state as a text badge; the next action is next to it.
2. **Rules visible at the point of action.** Deadlines, locks and gates are explained where the user hits them (for example "The work schedule can be set once the work plan is approved").
3. **Inline over modal.** Confirmations and password re-checks appear inline in the card or row (Export Center), not in pop-up dialogs, keeping context and focus. The bulk endorsement password prompt is the one dialog today.
4. **Never colour alone.** Colour supports the text label; it never replaces it.
5. **Server is the source of truth.** The UI never computes official hours or deadlines on its own; it shows what the server returns, in Manila time.
6. **Calm density.** Data-dense tables for staff, generous spacing and one primary action for students.

## 4. Colour tokens (as built)

All colours are CSS variables in `src/app/globals.css`, defined once for light mode (`:root`) and once for dark mode (`.dark`). Components use the variables, never raw colours. The theme follows the device setting by default; users can pick light, dark or system in the account menu or Account settings (`next-themes`).

| Token                      | Light (HSL)                       | Dark (HSL)    | Usage                                              |
| -------------------------- | --------------------------------- | ------------- | -------------------------------------------------- |
| `--background`             | `216 45% 97%`                     | `214 50% 8%`  | Page background (pale blue tint / deep night navy) |
| `--foreground`             | `215 28% 9%`                      | `212 38% 93%` | Body text                                          |
| `--card`                   | `0 0% 100%`                       | dark navy     | Cards and panels                                   |
| `--primary` / `--ring`     | `209 59% 30%`                     | `210 58% 64%` | Primary buttons, links, focus ring (SLU navy)      |
| `--secondary` / `--accent` | `213 45% 96%`                     | dark navy     | Secondary surfaces, hover                          |
| `--muted-foreground`       | `218 9% 40%`                      | `213 20% 68%` | Secondary text (at least 4.5:1 on both grounds)    |
| `--border`                 | `215 28% 90%`                     | `214 32% 21%` | Borders and inputs                                 |
| `--destructive`            | `358 69% 46%`                     | `0 70% 50%`   | Destructive actions, errors                        |
| `--chart-1…5`              | navy, light blue, ink, red, green | darker set    | Charts; status charts use `--color-status-*`       |
| `--radius`                 | `0.5rem`                          | —             | Cards, buttons, inputs                             |

Status badges keep five tones. In dark mode the Tailwind palette is mirrored once in `globals.css`, so the same classes stay readable without per-component dark styles:

| Tone  | Statuses                                                                                |
| ----- | --------------------------------------------------------------------------------------- |
| Green | Approved, Approved Active, Validated, Generated, Sent, Regarded, Completed              |
| Amber | Pending, Pending Draft, Drafting, Submitted, For HTE/University Review, Expiring, Draft |
| Red   | Returned, Rejected, Expired, Failed, Disregarded, Needs Attention                       |
| Blue  | On Track, Archived, Locked, Linked                                                      |
| Slate | Anything else                                                                           |

Surfaces use light frosted glass (`glass` utilities) over a soft coloured backdrop; text on glass keeps at least 4.5:1 contrast. The PDF letterhead uses navy `#1E3A5F`.

## 5. Typography

| Use            | As built                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| UI font        | DM Sans (`--font-dm-sans`, loaded with `next/font`)                                                    |
| Display font   | Bricolage Grotesque (`--font-bricolage`, class `font-display`) for headings, the brand and big numbers |
| Page title     | Shared `PageHeader` component: `text-2xl font-semibold tracking-tight` plus a one-line description     |
| Body           | `text-sm` in tables and forms, `text-base` elsewhere                                                   |
| Secondary text | `text-sm text-muted-foreground`; hints `text-xs`                                                       |
| PDFs           | Arial/Helvetica 11 pt; letterhead 14 pt bold navy                                                      |

## 6. Layout and spacing

- **Shell** (`(dashboard)/layout.tsx`): a 240 px frosted-glass sidebar on desktop that collapses to a 72 px icon rail (remembered in a `sidebar` cookie); the content column is fluid, capped at 1480 px, padding `px-4` to `xl:px-12`. A "Skip to content" link comes first for keyboard users, and a site footer closes every page.
- **Mobile:** top bar with the brand, bell, account avatar and a menu button that opens a slide-over drawer; it closes on navigation.
- **Spacing scale:** Tailwind 4 px steps; cards use `p-5`/`p-6`, sections `mb-4`/`gap-4`, inline gaps `gap-1.5`–`gap-3`.
- **Grids:** stat cards in responsive grids (one column on phones, up to four on desktop); tables full-width inside cards.
- **Print:** navigation hidden (`print:hidden`), padding removed, so the weekly report preview prints cleanly.

## 7. Component inventory

| Component                                                        | Source                                                        | Notes                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Button, Input, Label, Textarea, Card, Table, Badge, Form, Dialog | `src/components/ui/*` (shadcn/ui, Radix)                      | Dialog is used only for the bulk endorsement password prompt (the mobile nav is a custom drawer); prefer inline patterns |
| Toaster                                                          | `ui/sonner.tsx` (sonner)                                      | Short success/error confirmations after actions                                                                          |
| StatusBadge                                                      | `components/status-badge.tsx`                                 | Text label + tinted background + dot; humanises enum values ("For Hte Review")                                           |
| StatCard                                                         | `components/stat-card.tsx`                                    | Label, big value, optional hint, tinted icon (aria-hidden)                                                               |
| EmptyState                                                       | `components/empty-state.tsx`                                  | Dashed border, icon, title, description, optional action                                                                 |
| ComplianceTable                                                  | `components/compliance-table.tsx`                             | Shared staff table: hours bar, pending hours, checklist x/9, due-week state, status                                      |
| AuthShell                                                        | `components/auth-shell.tsx`                                   | Two-panel sign-in and reset pages                                                                                        |
| PasswordAction                                                   | `admin/export-center/password-action.tsx`                     | Inline password re-check form with confirm/cancel, focus kept in the form                                                |
| NotificationBell                                                 | `(dashboard)/notification-bell.tsx`                           | Unread count, links to `/notifications`                                                                                  |
| PageHeader                                                       | `components/page-header.tsx`                                  | Page title, one-line description, optional actions; one per page                                                         |
| BrandMark, Avatar                                                | `components/brand-mark.tsx`, `avatar.tsx`                     | Lighthouse logo; initials avatar for the signed-in account                                                               |
| AccountMenu, ThemeChoice                                         | `(dashboard)/account-menu.tsx`, `components/theme-toggle.tsx` | Who is signed in, Account settings, theme, privacy, terms, sign out                                                      |
| PasswordInput                                                    | `components/ui/password-input.tsx`                            | Show/Hide button, Caps Lock hint, hides again on submit                                                                  |
| InternCharts                                                     | `components/intern-charts.tsx`                                | Staff home charts with a screen-reader table version                                                                     |
| SiteFooter                                                       | `components/site-footer.tsx`                                  | SLU links (new tab), Help, Privacy, Terms, copyright                                                                     |
| Icons                                                            | lucide-react                                                  | Always with a visible text label or `aria-hidden` when decorative                                                        |

## 8. Interaction patterns

| Pattern           | Rule (as built)                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmation      | Inline confirm in the row or card (for example Delete on a retention flag, Mark fulfilled) instead of a modal                                              |
| Sensitive actions | Inline password field; wrong password shows an inline error; lockout message names the time it lifts                                                       |
| Required notes    | Return actions require a note; without one the server rejects the action and the message explains why. Buttons are disabled while a request is in progress |
| Status            | StatusBadge everywhere, never colour-only                                                                                                                  |
| Empty states      | EmptyState with what is missing and what to do ("No weekly reports yet")                                                                                   |
| Feedback          | Buttons show pending state; toasts confirm success or show the server's error message                                                                      |
| Locks             | Locked features explain the condition ("Unlocks at 500 confirmed hours (212 / 500 so far)")                                                                |
| Downloads         | Files download through the app's own routes (signed links); failed PDFs show Regenerate                                                                    |
| Warnings          | Copy-paste warnings sit next to the affected day, not only at the top                                                                                      |
| Time              | Manila time everywhere; deadlines stated with the time ("Tuesday 11:59 PM")                                                                                |

## 9. Role dashboards

| Role                      | Layout                                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student                   | Greeting hero; when every required hour is confirmed it says so and offers **Submit final report**; confirmed-hours ring; "Your weeks" track; next deadline; submission streak; **Needs attention** list; pre-deployment requirements; recent weeks; final report cover |
| Faculty                   | Greeting hero; stat cards; charts of where interns stand and weekly report status; My students table; Export to Excel and Weekly summary; bulk endorsement per class group                                                                                              |
| Coordinator / Super Admin | Greeting hero; stat cards per program; charts (where interns stand, weekly reports over 8 weeks, hours completed); host-company cards; filters (semester, program, status); all-students compliance table; exports                                                      |

## 10. Accessibility

Target: **WCAG 2.1 AA**.

As built:

- Text contrast: foreground `#0F172A` and muted `#64748B` on white meet 4.5:1; badge text uses the 700 shade on a 50 tint.
- Visible focus: shadcn components use the `ring` token (`#2563EB`); focus outlines are not removed.
- Keyboard: all actions are buttons or links; the mobile menu has labelled open/close buttons and `role="dialog"` with `aria-modal`; the inline password form keeps focus inside it.
- Icons are `aria-hidden` when decorative; icon-only buttons have `aria-label`.
- Current page in the nav uses `aria-current="page"`.
- Status is always text, not colour alone.
- Language: `<html lang="en">`.

**Recommendation (not built)**, from the ui-ux-pro-max accessibility and forms guidelines:

- Announce asynchronous changes (toasts, unread count) with a single `role="status"` message that has context ("3 unread notifications"), not a bare number.
- Wrap wide staff tables in a horizontally scrollable region (or card layout on phones) so nothing overflows at 375 px.
- Keep focus visible under the fixed mobile top bar (`scroll-padding-top`), per WCAG 2.2 "Focus not obscured".
- Show form errors next to each field plus a short summary on long forms (weekly report).
- Ensure touch targets of at least 44 × 44 px for the day-status selector and row actions on phones.
- Respect `prefers-reduced-motion` for the drawer and hover transitions.
- Run an automated audit (axe) and a keyboard-only walkthrough as part of Phase 5 UAT.

## 11. Responsive behaviour

- Breakpoints: Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280 px). The sidebar appears at `md`.
- Students are expected to use phones; their pages are single-column with stacked cards.
- Staff tables are designed for desktop; on phones they need horizontal scrolling (see recommendation above).
- Test widths: 375, 768, 1024, 1440 px.

## 12. PDF and print design

- PDFs are rendered on the server from HTML templates (`src/lib/documents/*`) with Chromium, so they look the same everywhere.
- Common elements: text letterhead (SAMCIS, Saint Louis University, navy rule), reference code and generation time, Manila dates, Arial 11 pt.
- Documents: weekly report, monthly report, endorsement letter, final report cover.
- **In progress (L1):** the weekly report follows SLU's Weekly Work Report template: header with school and department, "Week No. N (date range)", "Name: Last, First M.", Company; a Detailed Time Record table (Date (Day) | Actual Work Times with up to two ranges | Hours Rendered as "N hrs M mins" | Work Accomplishment); holiday rows "Holiday (PH Calendar)"; beginning, week and ending totals; supervisor signature block; optional "Report on Overtime Hours" and "Report on Under Time Hours" sections, each with its own supervisor signature line and SLU's notes.
- **Recommendation (not built):** replace the text letterhead with SLU's official letterhead (logo and seal) once supplied.

## 13. Content and copy guidelines

- Use the SLU terms users know: HTE, MOA, OJT, Weekly Work Report, endorsement letter (see [Glossary](12-glossary.md)).
- Buttons are verbs: "Submit", "Approve", "Return", "Generate", "Request my data".
- Errors say what to do: "Set your full name in Account settings first".
- Mention Google Classroom wherever a document must go there ("signed documents are never uploaded to IDSMS").
- Use "confirmed" for approved hours and "pending review" for submitted hours.
- Name the person or role that acts next ("awaiting faculty review").
- Dates as "Oct 13, 2026"; times as "8:00 AM"; always Manila time.

## 14. Recommendations from the design review

Items marked **Built** were done in later work; the rest are **Recommendation (not built)**.

| Priority | Recommendation                                                                | Status                         |
| -------- | ----------------------------------------------------------------------------- | ------------------------------ |
| High     | Announce async status changes with contextual `role="status"` text            | Recommendation (not built)     |
| High     | Horizontal-scroll or card layout for staff tables on phones                   | **Built** (#98)                |
| High     | Field-level errors plus an error summary on the weekly report form            | Recommendation (not built)     |
| Medium   | Show hours as "N hrs M mins" everywhere, for consistency with the PDF         | Recommendation (not built)     |
| Medium   | Add the SLU logo and seal to the sidebar header and PDFs                      | Waiting for SLU's official art |
| Medium   | A first-login tour (NFR-USA-02) explaining status colours and the main action | Partly: Help page (#111)       |
| Low      | Dark theme switch                                                             | **Built** (#107)               |
| Low      | Respect reduced-motion preferences for transitions                            | **Built** (`globals.css`)      |
