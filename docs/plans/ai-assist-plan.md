# Plan: where AI should help in IDSMS, and where it should not

_24 October 2026. Status: **proposal, nothing built**. To be grilled and reviewed by the LLM council before any code._

## 1. What already exists (Phase 4, switched off)

| Piece | What it does | Where |
| --- | --- | --- |
| Similarity | Finds daily entries that are near-copies of earlier ones (Gemini embeddings, pgvector 0.8.2 installed) | `src/lib/services/ai/aiService.ts`, `src/lib/ai/processing.ts` |
| Sentiment | Flags a worrying tone in a week's entries for the adviser | same |
| Display | Shows both as hints on the adviser's review page only; never changes status, hours or grades | `src/lib/ai/display.ts` |
| Safety | Personal data scrubbed before text leaves the server; daily batch capped to the Gemini free tier | `scrubPii.ts`, `batch.ts` |
| Switch-on gates | AI stays off until (1) someone records who approved the privacy basis and (2) a golden set of 30 or more adviser-labelled pairs passes at least 80% precision and 70% recall | `admin.ts`, `golden.ts`, `evaluation.ts` |

The Gemini key is set. Nothing has been processed yet (0 of 2 dev reports), and the golden set is only a blank template (`docs/ai/golden-set.template.csv`).

**So the answer to "can we plug and play?" is: almost.** The code is built. What's missing is human work: label 30 pairs and record the privacy approval (adviser question Q16).

## 2. The problem worth solving

An adviser with 40 interns reads about 40 weekly reports a week, each 4–6 days of free text. The slow part is not finding copies (already handled); it is reading everything to find the few weeks that need attention. Interns lose time when a report is returned for being vague, a week after they wrote it.

## Decisions (24 October 2026, Jay)

- **AI is auxiliary, never the doer.** It supports advisers, faculty and interns, and never decides, approves, or completes work for anyone: no AI-written reports, no AI-made reviews. It points people at what to check; people do the work.
- **Golden-set labels:** the team prepares 30–40 anonymized report pairs and labels them; the adviser confirms the labels in one sitting.
- **Summaries plus pointers (AI grill Q2: b).** Advisers get a short summary of a week, plus pointers linking to the exact entries. The summary is labelled as AI, sits beside the entries rather than replacing them, and must pass the "nothing invented" gate before switch-on.
- **The pre-submit check only warns (AI grill Q3: a).** Vague or repeated days get a warning, and the intern can fix them or submit anyway. IDSMS never blocks a submission on content; the adviser decides.
- **The company evaluation is required (AI grill Q4: a).** It is one more post-internship checklist item, so companies reach the 5-intern minimum. Only the ratings are required; free text stays optional. Like the other checklist items, IDSMS tracks that it is done.

## 3. Principle: rules first, AI only where rules cannot do it

Most "AI ideas" can be done with plain rules that are always correct and cost nothing. AI is used only where the meaning of free text matters, and it always stays advisory.

| Idea | Rules or AI? | Why |
| --- | --- | --- |
| "This day is too short or vague" before submitting | **Rules** (minimum length, repeated text, missing tools) | Deterministic and instant; part of it already exists (`copy-paste-warning.ts`) |
| Final report is missing a required section | **Rules** (check the SLU template's headings) | Headings are fixed text |
| Coordinator overview of the cohort | **Rules** (the dashboards already count this) | No free text involved |
| Rewriting an intern's accomplishments for them | **No** | Defeats the purpose of the report and raises academic-integrity questions |
| "Week at a glance" summary for the adviser | **AI** | Needs to read meaning across free-text days |

## 4. Goals

1. Switch on the existing hints only after they pass the golden-set gate.
2. Cut the time an adviser spends to find the weeks that need attention, without them reading less carefully when it matters.
3. Fewer reports returned for vagueness, by catching it before submission.
4. Never change a number that affects grades: AI output is a hint, always labelled as such.

## 5. Non-goals

- **No AI-written report text for interns.** Integrity; the report must be the intern's own words.
- **No AI decisions.** No auto-approve, auto-return or auto-deduction. Advisers decide.
- **No chatbot.** High cost and risk for unclear value; the help page and FAQ already answer common questions.
- **No paid models.** The Gemini free tier, within its rate limits.

## 6. Requirements

**P0, switch on what exists (no new code)**
- Advisers label 30 or more report pairs in the golden-set CSV; the evaluation passes the gate.
- The privacy approval is recorded by name in AI settings.
- Acceptance: AI settings refuses to enable until both are true (already enforced).

**P1, rule-based pre-submit check for interns (no AI)**
- Before submitting, flag days whose accomplishments are under a minimum length, repeat another day, or repeat last week.
- Acceptance: a test per rule; the warning never blocks a save, only asks to confirm on submit (as the copy-paste warning does today).

**P1, "Week at a glance" for advisers (AI, advisory)**
- On the review page: 2–3 sentences on what the intern did, plus flags (hours that do not match the work described, vague days).
- Built on the existing batch job, scrubbed text and cached columns; labelled "AI summary, check the entries".
- Acceptance gate before switch-on: advisers rate 30 sampled summaries; **at least 90% must contain nothing that is not in the entries** (no invented work), and at least 80% rated useful.

**P1, work-plan alignment pointers for advisers (AI embeddings, no generated text)**
- The approved work plan already stores the intern's planned tasks (`WorkPlan.plannedTasks`). Embed each planned task once; compare each day's entry with them, using the existing pgvector setup.
- Show pointers, each linking to the exact entries: "Planned task 'software testing' not mentioned in 4 weeks", "Thursday's work matches no planned task".
- No score, no percentage: evidence only. Nothing generated, so nothing can be invented.
- Acceptance gate: advisers check 30 sampled pointers; at least 80% judged correct.

**P1, confirm or dismiss on every AI finding**
- Each hint (similarity, tone, alignment) gets "Correct" / "Not right" for the adviser. The counts measure accuracy week by week, after switch-on as well as before.

**P1, welfare flags (extends the existing sentiment hint)**
- Specific flags instead of a general mood: repeated overtime, no supervision, tasks unrelated to the plan, unsafe conditions. Flags only; the adviser follows up.

**P1, "Internship experience here" on each company page (staff only)**

Helps coordinators and advisers judge whether a company is worth partnering with more. The system shows evidence; people make the judgement. Sections, in order of reliability:

1. **Facts, no AI.** Interns placed per term; average hours a week; how often overtime was filed; absences; share of weekly reports on time; work setup; company days off.
2. **What interns do here (AI-assisted, with evidence).** Daily entries grouped into kinds of work (for example development, testing, design, documentation, support, clerical), with counts and a few example entries with names removed. Uses the existing embeddings; nothing generated.
3. **Signals across interns.** How many interns had overtime, supervision, safety or unrelated-work flags, each linked to the reports (staff only).
4. **AI summary** of what interns typically do and experience here, labelled as AI, beside the evidence, gated like the weekly summary.
5. **Interns' own end-of-internship evaluation of the company** (a short structured form, no AI): the most direct evidence for "worth partnering with". CMO 104 Sec. 14.2.2 requires SLU to "conduct monitoring and evaluation of the HTE … and provide feedback mechanism", but names no student form, so this is one way to meet that duty, not a mandate. Criteria are drawn from Cameron University's form, NEUST (Natividad 2025) and UP CIDS (Santillana 2026); see `docs/reference/hte-evaluation-research.md`.
   - **Supervision and mentoring**: a designated supervisor; scheduled feedback.
   - **Learning and relevance**: tasks match the program and the work plan.
   - **Safety and welfare.**
   - **Communication and onboarding.**
   - **Integration and treatment**: treated as staff; suggestions heard.
   - **Resources.**
   - **Would you recommend this company to next year's interns?**

   Required for every intern as a post-internship checklist item (Q4). Ratings use a 5-point scale per criterion. The free text is optional, factual ("what happened"), and names are removed before staff see it. The form rates the *role* ("my supervisor"), never a named person.

Rules, updated with the research:
- **No verdict, no score.** No "good/bad partner" label; coordinators judge.
- **Staff only.** Never shown to students or the public. Online libel is cyber-libel (RA 10175) with a heavier penalty, while a private communication made in the line of duty is a recognised exception (RPC Art. 354). Coordinator-only access under the CMO 104 duty fits that exception (our inference; confirm with the DPO).
- **Minimum group of 5 interns** before any aggregate (ratings, signals, kinds of work) is shown. The US Dept. of Education PTAC treats 3 as the absolute minimum and 5–10 as common. Pool across terms until a company reaches 5, and never split by program or term if that leaves a group under 5 (complementary suppression).
- **Facts and opinions kept apart.** Hours, task types and incident flags are structured fields; free text is shown separately and labelled as interns' opinions.
- **Company reply.** The coordinator can share an anonymised summary with the company and record its response, which meets CMO 104's "feedback mechanism". UP CIDS found HTEs "rarely" get such feedback.
- **Privacy (RA 10173).** Named supervisors are data subjects. The lawful basis is legitimate interest (the CMO 104 duty), the data collected stays "adequate and not excessive", and the privacy notice must cover HTE feedback. A named person can dispute inaccurate feedback through the existing data-request flow.
- **Ask the coordinator** whether SLU already has an in-house HTE evaluation form; if it does, use it instead of these criteria.

**Considered and rejected** (from an outside AI's broader proposal, 24 October 2026)
- AI-suggested grades or drafted feedback: AI doing the adviser's work.
- AI-written-text or writing-style detectors: unreliable; false accusations harm students.
- Alignment or risk percentages: unexplained numbers invite blind trust; evidence links instead.
- Alignment against the MOA: a legal agreement, not a task list; the work plan is the reference.
- A local or hybrid model: needs hardware and an owner; revisit after the school-server move.
- Visual-evidence uploads, supervisor feedback, partner analytics: new scope for a graduating team.

**P2, later**
- A monthly-journal starting outline built only from the intern's own weekly entries (pending the adviser's view on integrity).
- Final report section check against the SLU template (rules).

## 7. How we know it is correct

Semantic AI can be wrong, so nothing switches on without a measured check against human judgment:
- Similarity and sentiment: the existing golden-set gate (precision and recall, at least 30 pairs).
- Summaries: the adviser-rated sample above, re-run whenever the model changes (models are pinned because Google retires them).
- Every hint stays visible as a hint and links back to the entries it came from.

## 8. Open questions

| Question | Who answers | Blocking? |
| --- | --- | --- |
| Will advisers label 30 pairs and 30 summaries? (about two hours each) | Adviser / Jay | Yes, for switch-on |
| Is sending scrubbed report text to Google acceptable under SLU's data privacy rules? | SLU data protection office (Q16) | Yes |
| Do the free-tier daily limits cover a weekly batch for 2,000 interns? | Engineering: measure on one week's batch | Yes, for P1 summaries |
| Is an AI-built monthly outline acceptable? | Adviser | No (P2) |
| Does SLU already have an HTE evaluation form for interns? | Coordinator | No (use it if so) |
| Is coordinator-only HTE feedback within the private-duty exception, and does the privacy notice need a new line? | SLU data protection office | Yes, for the company evaluation |

## 9. Order

1. P0: label the golden set, record privacy approval, switch on, watch for two weeks.
2. P1 rules check for interns (no AI, warn only, can ship any time).
3. P1 confirm/dismiss on findings, then work-plan alignment pointers, then welfare flags.
4. Summaries only if Jay chooses them (AI grill Q2), and only after the rated-sample gate passes.
