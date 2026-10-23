# AI Advisory (Similarity + Sentiment) Implementation Plan (Phase 4 · Workstream D — last priority)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give faculty _advisory-only_ AI signals on submitted weekly reports:

- **Near-duplicate detection** against the student's earlier reports (Gemini embeddings + pgvector).
- **Sentiment** (Gemini 2.5 Flash), with a confidence score and brief reasoning.
- Both are computed in the background and cached. The feature ships **off**, and can only be enabled once the golden-set evaluation passes (NFR-AI-02) and the privacy decision (D5) is recorded.

**Architecture:**

- **Adapter.** All model calls go through `src/lib/services/aiService.ts` (NFR-MNT-05 swappable adapter). It calls Gemini's REST API with `fetch` (no new SDK dependency) and scrubs PII before every call.
- **Storage.** Embeddings live in the existing `daily_report_entries.embedding_vector vector(768)` column, written and queried with `$executeRaw`/`$queryRaw`.
- **Processing.** An orchestrator processes one report per call. It's triggered by Workstream C's daily cron (catch-up) and by a fire-and-forget POST after submit. Page loads only ever read cached columns (FR-AI-05).

**Tech Stack:** Gemini REST (`text-embedding-004` → 768-dim, `gemini-2.5-flash` JSON mode) · pgvector cosine (`<=>`) · Prisma `$queryRaw` · zod · Jest.

**Spec:** `PRD.md` FR-AI-01..07, NFR-AI-01..04, NFR-MNT-02/05; roadmap risks R4 (privacy), R5 (golden set), R15 (pgvector).
**Prerequisites:**

- Workstream C merged: `/api/cron/daily` exists, and D adds one call to it.
- `prisma/migrations_manual/001` applied (pgvector extension and column). Verify with `select 1 from pg_extension where extname='vector'`.

## Decisions applied

- **D5, privacy (undecided):**
  - `ai:enabled` defaults to **false**, and nothing calls Gemini while it's false.
  - Enabling requires a Super Admin to record `privacyApprovedBy` (the adviser's name, as text), which is audit-logged.
  - A PII scrubber always runs before text leaves the server: it removes emails, student numbers, phone numbers, URLs, and the student's own full name.
- **D6, golden set (undecided):** enabling also requires a stored evaluation at the current threshold with precision ≥ 0.80 and recall ≥ 0.70 (NFR-AI-02). If the adviser never labels the set, AI simply stays off, which is an acceptable Phase 4 outcome per the roadmap.
- **Model retirement risk (new, R16):** Google rotates embedding models. The model names come from env vars (`GEMINI_EMBEDDING_MODEL`, default `text-embedding-004`; `GEMINI_SENTIMENT_MODEL`, default `gemini-2.5-flash`), and the embed call always requests `outputDimensionality: 768` so a successor model still fits the column.

## Global Constraints

- FR-AI-06 (**Must**): AI output never changes report status, hours, or review actions. No code path from `aiService` or `aiProcessing` may write `status`, `facultyAction`, or call a `reviewWeeklyReport_*` function.
- FR-AI-05: no Gemini call during page rendering. Only the cron and the dedicated POST route may call `processWeeklyReportAi`.
- FR-AI-02: threshold default 0.70, admin-adjustable only within [0.60, 0.85].
- NFR-AI-03: a threshold change shows the precision/recall at the new value **before** it's confirmed, and the audit log records the change with those figures.
- NFR-AI-04: sentiment below `ai:min_sentiment_confidence` (default 0.60) is stored but **not displayed**.
- PII never leaves the server unscrubbed. The API key is sent as the `x-goog-api-key` header, never in a URL or log.
- Rate limits: 1 report at a time, ≤ 20 reports per cron run, each Gemini call with a 15 s timeout.
- No Claude/Anthropic attribution in commits.

## Review Focus

1. **AI is disabled (the default).** The cron and submit hook must make **zero** Gemini calls. → Task 4 test `does nothing while ai:enabled is false`.
2. **Gemini returns malformed JSON or an out-of-range confidence for sentiment.** Nothing is stored, the run doesn't crash, and the report stays retryable. → Task 2 test `rejects a malformed sentiment response`.
3. **The student's first-ever report** (nothing earlier to compare). Similarity is null and the report isn't flagged. → Task 3 test `first report has no similarity score`.
4. **Text containing the student's email, student number, or name** must be scrubbed before the request body is built. → Task 2 test `scrubs PII before sending`.
5. **An admin tries a threshold outside 0.60–0.85**, or confirms without previewing. 400, and nothing changes. → Task 5 test `rejects an out-of-range threshold`.

---

### Task 1: Sentiment reasoning column, AI settings, and the evaluation math

**Files:**

- Modify: `prisma/schema.prisma` (`WeeklyReport.sentimentReasoning String?`)
- Create: `prisma/migrations_manual/006_ai_sentiment_reasoning.sql`, `src/lib/ai/settings.ts`, `src/lib/ai/evaluation.ts`
- Test: `src/lib/ai/evaluation.test.ts`, `src/lib/ai/settings.test.ts`

**Interfaces:**

- Produces:
  - `interface AiSettings { enabled: boolean; similarityThreshold: number; minSentimentConfidence: number; privacyApprovedBy: string | null; lastEval: EvalResult | null }`
  - `getAiSettings(): Promise<AiSettings>`
  - `type LabeledScore = { score: number; label: "DUPLICATE" | "BOILERPLATE" }`
  - `interface EvalResult { threshold: number; tp: number; fp: number; fn: number; tn: number; precision: number; recall: number; passes: boolean; evaluatedAt: string; pairCount: number }`
  - `evaluateThreshold(scores: LabeledScore[], threshold: number, now?: Date): EvalResult` (`passes` = precision ≥ 0.8 && recall ≥ 0.7 && pairCount ≥ 30)
  - Keys: `ai:enabled`, `ai:similarity_threshold`, `ai:min_sentiment_confidence`, `ai:privacy_approved_by`, `ai:last_eval`, `ai:golden_scores`

- [ ] **Step 1: Write the failing tests**

`src/lib/ai/evaluation.test.ts`:

```ts
import { evaluateThreshold, type LabeledScore } from "@/lib/ai/evaluation";

const dup = (score: number): LabeledScore => ({ score, label: "DUPLICATE" });
const boiler = (score: number): LabeledScore => ({ score, label: "BOILERPLATE" });

it("builds the confusion matrix at the threshold (score > threshold flags)", () => {
  const scores = [dup(0.95), dup(0.9), dup(0.65), boiler(0.8), boiler(0.4), boiler(0.3)];
  const r = evaluateThreshold(scores, 0.7, new Date("2026-10-11T00:00:00Z"));
  expect(r).toEqual(
    expect.objectContaining({ tp: 2, fn: 1, fp: 1, tn: 2, pairCount: 6, threshold: 0.7 })
  );
  expect(r.precision).toBeCloseTo(2 / 3);
  expect(r.recall).toBeCloseTo(2 / 3);
  expect(r.passes).toBe(false);
});

it("passes only with ≥80% precision, ≥70% recall, and ≥30 labeled pairs (NFR-AI-01/02)", () => {
  const good = [...Array(15)].map(() => dup(0.9)).concat([...Array(15)].map(() => boiler(0.2)));
  expect(evaluateThreshold(good, 0.7).passes).toBe(true);
  expect(evaluateThreshold(good.slice(0, 20), 0.7).passes).toBe(false); // too few pairs
});

it("reports zero precision (not NaN) when nothing is flagged", () => {
  const r = evaluateThreshold([dup(0.1), boiler(0.1)], 0.7);
  expect(r.precision).toBe(0);
  expect(r.recall).toBe(0);
});
```

`src/lib/ai/settings.test.ts`:

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { getAiSettings } from "@/lib/ai/settings";

beforeEach(() => resetPrismaMock());

it("defaults to disabled, 0.70 threshold, 0.60 confidence", async () => {
  prismaMock.systemConfig.findMany.mockResolvedValue([]);
  await expect(getAiSettings()).resolves.toEqual({
    enabled: false,
    similarityThreshold: 0.7,
    minSentimentConfidence: 0.6,
    privacyApprovedBy: null,
    lastEval: null,
  });
});

it("clamps an out-of-range stored threshold back to the default", async () => {
  prismaMock.systemConfig.findMany.mockResolvedValue([
    { configKey: "ai:similarity_threshold", configValue: 0.99 },
    { configKey: "ai:enabled", configValue: true },
  ] as never);
  const s = await getAiSettings();
  expect(s.similarityThreshold).toBe(0.7);
  expect(s.enabled).toBe(true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/ai`
Expected: FAIL. Modules not found.

- [ ] **Step 3: Implement**

`prisma/schema.prisma`, in `model WeeklyReport` after `sentimentConfidence`:

```prisma
  sentimentReasoning  String?          @map("sentiment_reasoning") @db.Text // FR-AI-03 brief reasoning
```

`prisma/migrations_manual/006_ai_sentiment_reasoning.sql`:

```sql
-- Phase 4 Workstream D: FR-AI-03 "brief reasoning". Additive, nullable.
alter table weekly_reports add column if not exists sentiment_reasoning text;
```

`src/lib/ai/evaluation.ts`:

```ts
export type LabeledScore = { score: number; label: "DUPLICATE" | "BOILERPLATE" };

export interface EvalResult {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  passes: boolean;
  evaluatedAt: string;
  pairCount: number;
}

export const MIN_GOLDEN_PAIRS = 30; // NFR-AI-01
export const MIN_PRECISION = 0.8; // NFR-AI-02
export const MIN_RECALL = 0.7; // NFR-AI-02

// Pure: the confusion matrix for "flag when cosine similarity > threshold"
// over the faculty-labelled golden set.
export function evaluateThreshold(
  scores: LabeledScore[],
  threshold: number,
  now = new Date()
): EvalResult {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  for (const { score, label } of scores) {
    const flagged = score > threshold;
    if (label === "DUPLICATE") flagged ? tp++ : fn++;
    else flagged ? fp++ : tn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return {
    threshold,
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    passes: scores.length >= MIN_GOLDEN_PAIRS && precision >= MIN_PRECISION && recall >= MIN_RECALL,
    evaluatedAt: now.toISOString(),
    pairCount: scores.length,
  };
}
```

`src/lib/ai/settings.ts`:

```ts
import { prisma } from "@/lib/prisma";
import type { EvalResult } from "@/lib/ai/evaluation";

export const AI_KEYS = {
  enabled: "ai:enabled",
  threshold: "ai:similarity_threshold",
  minConfidence: "ai:min_sentiment_confidence",
  privacyApprovedBy: "ai:privacy_approved_by",
  lastEval: "ai:last_eval",
  goldenScores: "ai:golden_scores",
} as const;

export const THRESHOLD_MIN = 0.6; // FR-AI-02
export const THRESHOLD_MAX = 0.85;

export interface AiSettings {
  enabled: boolean;
  similarityThreshold: number;
  minSentimentConfidence: number;
  privacyApprovedBy: string | null;
  lastEval: EvalResult | null;
}

export async function getAiSettings(): Promise<AiSettings> {
  const rows = await prisma.systemConfig.findMany({
    where: { configKey: { in: Object.values(AI_KEYS) } },
    select: { configKey: true, configValue: true },
  });
  const value = (key: string) => rows.find((r) => r.configKey === key)?.configValue;

  const threshold = value(AI_KEYS.threshold);
  const confidence = value(AI_KEYS.minConfidence);
  const approvedBy = value(AI_KEYS.privacyApprovedBy);
  const lastEval = value(AI_KEYS.lastEval);

  return {
    enabled: value(AI_KEYS.enabled) === true,
    similarityThreshold:
      typeof threshold === "number" && threshold >= THRESHOLD_MIN && threshold <= THRESHOLD_MAX
        ? threshold
        : 0.7,
    minSentimentConfidence:
      typeof confidence === "number" && confidence > 0 && confidence < 1 ? confidence : 0.6,
    privacyApprovedBy: typeof approvedBy === "string" && approvedBy.trim() ? approvedBy : null,
    lastEval: lastEval && typeof lastEval === "object" ? (lastEval as unknown as EvalResult) : null,
  };
}
```

- [ ] **Step 4: Run tests and validate the schema**

Run: `npx jest src/lib/ai && npx prisma validate && npx prisma generate && npx tsc --noEmit`
Expected: PASS / valid / clean.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations_manual/006_ai_sentiment_reasoning.sql src/lib/ai
git commit -m "Add AI settings, golden-set evaluation math, and sentiment reasoning column"
```

---

### Task 2: PII scrubber and the Gemini REST adapter

**Files:**

- Create: `src/lib/ai/scrubPii.ts`
- Replace: `src/lib/services/aiService.ts` (currently a 3-line comment)
- Test: `src/lib/ai/scrubPii.test.ts`, `src/lib/services/aiService.test.ts`

**Interfaces:**

- Produces:
  - `scrubPii(text: string, opts?: { names?: string[] }): string`
  - `embedText(text: string): Promise<number[]>` (length 768)
  - `interface SentimentResult { label: "POSITIVE" | "NEUTRAL" | "NEGATIVE"; confidence: number; reasoning: string }`
  - `classifySentiment(text: string): Promise<SentimentResult>`
  - `class AiProviderError extends Error`

- [ ] **Step 1: Write the failing tests**

`src/lib/ai/scrubPii.test.ts`:

```ts
import { scrubPii } from "@/lib/ai/scrubPii";

it("removes emails, student numbers, phone numbers, URLs, and given names", () => {
  const out = scrubPii(
    "Juan Dela Cruz (2026-00123-MN-0, juan@slu.edu.ph, 0917 123 4567) fixed https://acme.ph/x",
    { names: ["Juan Dela Cruz"] }
  );
  expect(out).not.toMatch(/Juan|2026-00123|@slu|0917|acme\.ph/);
  expect(out).toContain("[NAME]");
  expect(out).toContain("[EMAIL]");
  expect(out).toContain("[ID]");
  expect(out).toContain("[PHONE]");
  expect(out).toContain("[URL]");
});

it("leaves ordinary work text intact", () => {
  expect(scrubPii("Built the login page and wrote 12 unit tests")).toBe(
    "Built the login page and wrote 12 unit tests"
  );
});
```

`src/lib/services/aiService.test.ts`:

```ts
import { AiProviderError, classifySentiment, embedText } from "@/lib/services/aiService";

const fetchMock = jest.fn();
const ENV = { ...process.env };
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as never;
  process.env = { ...ENV, GEMINI_API_KEY: "test-key" };
});
afterAll(() => {
  process.env = ENV;
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

it("embeds with a 768-dim request, key in a header (never the URL)", async () => {
  fetchMock.mockResolvedValue(ok({ embedding: { values: Array(768).fill(0.1) } }));
  const v = await embedText("Built the login page");
  expect(v).toHaveLength(768);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain("text-embedding-004:embedContent");
  expect(url).not.toContain("test-key");
  expect(init.headers["x-goog-api-key"]).toBe("test-key");
  expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ outputDimensionality: 768 }));
});

it("scrubs PII before sending", async () => {
  fetchMock.mockResolvedValue(ok({ embedding: { values: Array(768).fill(0) } }));
  await embedText("Email me at juan@slu.edu.ph");
  expect(fetchMock.mock.calls[0][1].body).not.toContain("juan@slu.edu.ph");
});

it("rejects a wrong-dimension embedding", async () => {
  fetchMock.mockResolvedValue(ok({ embedding: { values: [0.1, 0.2] } }));
  await expect(embedText("x")).rejects.toThrow(AiProviderError);
});

it("parses a JSON-mode sentiment response", async () => {
  fetchMock.mockResolvedValue(
    ok({
      candidates: [
        {
          content: {
            parts: [
              { text: '{"label":"POSITIVE","confidence":0.82,"reasoning":"Upbeat progress."}' },
            ],
          },
        },
      ],
    })
  );
  await expect(classifySentiment("Great week")).resolves.toEqual({
    label: "POSITIVE",
    confidence: 0.82,
    reasoning: "Upbeat progress.",
  });
});

it("rejects a malformed sentiment response", async () => {
  fetchMock.mockResolvedValue(
    ok({ candidates: [{ content: { parts: [{ text: '{"label":"HAPPY","confidence":3}' }] } }] })
  );
  await expect(classifySentiment("x")).rejects.toThrow(AiProviderError);
});

it("surfaces HTTP errors as AiProviderError without leaking the key", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: "quota" } }),
  });
  await expect(embedText("x")).rejects.toThrow(/429/);
  await expect(embedText("x")).rejects.not.toThrow(/test-key/);
});

it("refuses to call out when GEMINI_API_KEY is missing", async () => {
  delete process.env.GEMINI_API_KEY;
  await expect(embedText("x")).rejects.toThrow(AiProviderError);
  expect(fetchMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest scrubPii aiService`
Expected: FAIL. Modules or exports missing.

- [ ] **Step 3: Implement**

`src/lib/ai/scrubPii.ts`:

```ts
// R4 / D5: strip personal data before any text leaves the server.
const PATTERNS: [RegExp, string][] = [
  [/https?:\/\/\S+/gi, "[URL]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]"],
  [/\b\d{4}-\d{5}-[A-Z]{2}-\d\b/gi, "[ID]"], // SLU student number
  [/(\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[PHONE]"], // PH mobile
];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrubPii(text: string, opts: { names?: string[] } = {}): string {
  let out = text;
  for (const name of opts.names ?? []) {
    if (name.trim().length < 2) continue;
    out = out.replace(new RegExp(escapeRegExp(name.trim()), "gi"), "[NAME]");
  }
  for (const [pattern, token] of PATTERNS) out = out.replace(pattern, token);
  return out;
}
```

`src/lib/services/aiService.ts`:

```ts
// Similarity detection (Gemini text-embedding-004 + pgvector) and sentiment analysis
// (Gemini 2.5 Flash), behind a swappable adapter per NFR-MNT-02/NFR-MNT-05.
// See PRD Module 9 (FR-AI-*) and NFR-AI-01..04 (golden set, precision/recall targets).
import { z } from "zod";
import { scrubPii } from "@/lib/ai/scrubPii";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBEDDING_DIM = 768; // must match daily_report_entries.embedding_vector
const TIMEOUT_MS = 15_000;

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

async function callGemini(model: string, method: string, body: unknown): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiProviderError("GEMINI_API_KEY is not configured");
  const res = await fetch(`${API_BASE}/${model}:${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    throw new AiProviderError(
      `Gemini ${model}:${method} failed (${res.status}): ${json.error?.message ?? "unknown"}`
    );
  }
  return json;
}

export async function embedText(text: string, opts: { names?: string[] } = {}): Promise<number[]> {
  const model = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
  const json = (await callGemini(model, "embedContent", {
    model: `models/${model}`,
    content: { parts: [{ text: scrubPii(text, opts) }] },
    outputDimensionality: EMBEDDING_DIM,
  })) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new AiProviderError(
      `Expected a ${EMBEDDING_DIM}-dim embedding, got ${values?.length ?? "none"}`
    );
  }
  return values;
}

const sentimentSchema = z.object({
  label: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().trim().min(1).max(400),
});
export type SentimentResult = z.infer<typeof sentimentSchema>;

const SENTIMENT_PROMPT =
  "Classify the overall sentiment of this internship weekly report written by a student. " +
  'Respond only with JSON: {"label": "POSITIVE"|"NEUTRAL"|"NEGATIVE", "confidence": 0..1, ' +
  '"reasoning": one short sentence}. This is advisory for a faculty adviser and must not judge the student.\n\nReport:\n';

export async function classifySentiment(
  text: string,
  opts: { names?: string[] } = {}
): Promise<SentimentResult> {
  const model = process.env.GEMINI_SENTIMENT_MODEL || "gemini-2.5-flash";
  const json = (await callGemini(model, "generateContent", {
    contents: [{ role: "user", parts: [{ text: SENTIMENT_PROMPT + scrubPii(text, opts) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  })) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };

  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "");
  } catch {
    throw new AiProviderError("Sentiment response was not JSON");
  }
  const result = sentimentSchema.safeParse(parsed);
  if (!result.success) throw new AiProviderError("Sentiment response failed validation");
  return result.data;
}
```

Append to `.env.example`:

```bash
# Phase 4 AI (advisory only; feature stays off until enabled by a Super Admin)
GEMINI_EMBEDDING_MODEL="text-embedding-004"
GEMINI_SENTIMENT_MODEL="gemini-2.5-flash"
```

- [ ] **Step 4: Run tests**

Run: `npx jest scrubPii aiService && npx tsc --noEmit`
Expected: PASS (9), clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/scrubPii.ts src/lib/ai/scrubPii.test.ts src/lib/services/aiService.ts src/lib/services/aiService.test.ts .env.example
git commit -m "Add PII-scrubbed Gemini adapter for embeddings and sentiment"
```

---

### Task 3: Per-report processing — embeddings, similarity, sentiment (cached)

**Files:**

- Create: `src/lib/ai/processing.ts`
- Test: `src/lib/ai/processing.test.ts`

**Interfaces:**

- Consumes: `embedText`, `classifySentiment` (Task 2); `getAiSettings` (Task 1); `getLatestSubmission` (weeklyReportService).
- Produces: `processWeeklyReportAi(weeklyReportId: string): Promise<{ processed: boolean; reason?: string; similarityScore?: number | null; sentimentLabel?: string }>`. It writes only `similarityScore`, `similarityFlag`, `sentimentLabel`, `sentimentConfidence`, `sentimentReasoning` and `aiProcessedAt`, plus `embedding_vector` on entries. Never `status` (FR-AI-06).

- [ ] **Step 1: Write the failing tests**

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/services/aiService", () => ({
  embedText: jest.fn(),
  classifySentiment: jest.fn(),
}));
jest.mock("@/lib/ai/settings", () => ({ getAiSettings: jest.fn() }));

import { classifySentiment, embedText } from "@/lib/services/aiService";
import { getAiSettings } from "@/lib/ai/settings";
import { processWeeklyReportAi } from "@/lib/ai/processing";

const settings = {
  enabled: true,
  similarityThreshold: 0.7,
  minSentimentConfidence: 0.6,
  privacyApprovedBy: "Adviser",
  lastEval: null,
};
const report = {
  id: "wr-2",
  studentProfileId: "p-1",
  weekStart: new Date("2026-10-12T00:00:00Z"),
  revisionHistory: [{ type: "SUBMITTED", timestamp: "t" }],
  studentProfile: { fullName: "Juan Dela Cruz" },
  dailyEntries: [
    { id: "e-1", accomplishments: "Built the login page" },
    { id: "e-2", accomplishments: null },
  ],
};

beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  (getAiSettings as jest.Mock).mockResolvedValue(settings);
  (embedText as jest.Mock).mockResolvedValue(Array(768).fill(0.1));
  (classifySentiment as jest.Mock).mockResolvedValue({
    label: "POSITIVE",
    confidence: 0.8,
    reasoning: "Good progress.",
  });
  prismaMock.weeklyReport.findUnique.mockResolvedValue(report as never);
  prismaMock.$executeRaw.mockResolvedValue(1 as never);
});

it("does nothing while ai:enabled is false", async () => {
  (getAiSettings as jest.Mock).mockResolvedValue({ ...settings, enabled: false });
  await expect(processWeeklyReportAi("wr-2")).resolves.toEqual({
    processed: false,
    reason: "AI is disabled",
  });
  expect(embedText).not.toHaveBeenCalled();
  expect(classifySentiment).not.toHaveBeenCalled();
});

it("skips reports that were never submitted (drafts)", async () => {
  prismaMock.weeklyReport.findUnique.mockResolvedValue({ ...report, revisionHistory: [] } as never);
  await expect(processWeeklyReportAi("wr-2")).resolves.toEqual(
    expect.objectContaining({ processed: false })
  );
  expect(embedText).not.toHaveBeenCalled();
});

it("embeds only non-empty entries, scores similarity, classifies, and caches — never touching status", async () => {
  prismaMock.$queryRaw.mockResolvedValue([{ max_similarity: 0.83 }] as never);

  const result = await processWeeklyReportAi("wr-2");

  expect(embedText).toHaveBeenCalledTimes(1);
  expect(embedText).toHaveBeenCalledWith("Built the login page", { names: ["Juan Dela Cruz"] });
  expect(result).toEqual({ processed: true, similarityScore: 0.83, sentimentLabel: "POSITIVE" });
  const update = prismaMock.weeklyReport.update.mock.calls[0][0] as {
    data: Record<string, unknown>;
  };
  expect(update.data).toEqual(
    expect.objectContaining({
      similarityScore: 0.83,
      similarityFlag: true,
      sentimentLabel: "POSITIVE",
      sentimentConfidence: 0.8,
      sentimentReasoning: "Good progress.",
      aiProcessedAt: expect.any(Date),
    })
  );
  expect(update.data).not.toHaveProperty("status");
  expect(update.data).not.toHaveProperty("facultyAction");
});

it("first report has no similarity score", async () => {
  prismaMock.$queryRaw.mockResolvedValue([{ max_similarity: null }] as never);
  const result = await processWeeklyReportAi("wr-2");
  expect(result.similarityScore).toBeNull();
  const update = prismaMock.weeklyReport.update.mock.calls[0][0] as {
    data: Record<string, unknown>;
  };
  expect(update.data).toEqual(
    expect.objectContaining({ similarityScore: null, similarityFlag: false })
  );
});

it("leaves the report unprocessed (retryable) when the provider fails", async () => {
  (classifySentiment as jest.Mock).mockRejectedValue(new Error("quota"));
  prismaMock.$queryRaw.mockResolvedValue([{ max_similarity: 0.2 }] as never);
  await expect(processWeeklyReportAi("wr-2")).rejects.toThrow("quota");
  expect(prismaMock.weeklyReport.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/ai/processing.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement** `src/lib/ai/processing.ts`

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifySentiment, embedText } from "@/lib/services/aiService";
import { getAiSettings } from "@/lib/ai/settings";
import { getLatestSubmission } from "@/lib/services/weeklyReportService";

// FR-AI-01/02/03/05. Advisory only (FR-AI-06): this function may write the
// cached AI columns and embeddings — never status, hours, or review fields.
// Throws on provider failure WITHOUT writing aiProcessedAt, so the next cron
// run retries the report.
export async function processWeeklyReportAi(weeklyReportId: string) {
  const settings = await getAiSettings();
  if (!settings.enabled) return { processed: false, reason: "AI is disabled" };

  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    select: {
      id: true,
      studentProfileId: true,
      weekStart: true,
      revisionHistory: true,
      studentProfile: { select: { fullName: true } },
      dailyEntries: { select: { id: true, accomplishments: true } },
    },
  });
  if (!report) return { processed: false, reason: "Report not found" };
  if (!getLatestSubmission(report.revisionHistory)) {
    return { processed: false, reason: "Report not submitted" };
  }

  const names = report.studentProfile.fullName ? [report.studentProfile.fullName] : [];
  const texts = report.dailyEntries.filter((e) => e.accomplishments?.trim());

  // 1. Embed each day's text and store it in the pgvector column (raw SQL —
  //    Prisma has no vector type; see migrations_manual/001).
  for (const entry of texts) {
    const vector = await embedText(entry.accomplishments!, { names });
    await prisma.$executeRaw`
      UPDATE daily_report_entries
      SET embedding_vector = ${`[${vector.join(",")}]`}::vector
      WHERE id = ${entry.id}::uuid`;
  }

  // 2. Highest cosine similarity between this report's days and any day from
  //    the same student's EARLIER reports (FR-AI-01). NULL when there's
  //    nothing earlier to compare against.
  const [row] = await prisma.$queryRaw<{ max_similarity: number | null }[]>`
    SELECT MAX(1 - (cur.embedding_vector <=> prev.embedding_vector))::float8 AS max_similarity
    FROM daily_report_entries cur
    JOIN daily_report_entries prev ON prev.embedding_vector IS NOT NULL
    JOIN weekly_reports pw ON pw.id = prev.weekly_report_id
    WHERE cur.weekly_report_id = ${report.id}::uuid
      AND cur.embedding_vector IS NOT NULL
      AND pw.student_profile_id = ${report.studentProfileId}::uuid
      AND pw.week_start < ${report.weekStart}`;
  const similarityScore =
    row?.max_similarity == null ? null : Math.round(Number(row.max_similarity) * 1000) / 1000;

  // 3. Sentiment over the whole week (FR-AI-03). Stored even when below the
  //    display threshold — NFR-AI-04 suppression happens at render time.
  const sentiment = texts.length
    ? await classifySentiment(texts.map((e) => e.accomplishments).join("\n"), { names })
    : null;

  await prisma.weeklyReport.update({
    where: { id: report.id },
    data: {
      similarityScore:
        similarityScore === null ? null : new Prisma.Decimal(similarityScore).toNumber(),
      similarityFlag: similarityScore !== null && similarityScore > settings.similarityThreshold,
      sentimentLabel: sentiment?.label ?? null,
      sentimentConfidence: sentiment?.confidence ?? null,
      sentimentReasoning: sentiment?.reasoning ?? null,
      aiProcessedAt: new Date(),
    },
  });

  return { processed: true, similarityScore, sentimentLabel: sentiment?.label };
}
```

(Simplify `new Prisma.Decimal(x).toNumber()` to plain `similarityScore` if tsc accepts a number for the Decimal field, which Prisma does. It's shown here only to make the 3-decimal storage explicit.)

- [ ] **Step 4: Run tests**

Run: `npx jest src/lib/ai/processing.test.ts && npx tsc --noEmit`
Expected: PASS (5), clean.

- [ ] **Step 5: Manual SQL sanity check (dev DB, Jay)**

Run this in the Supabase SQL editor, checking that the operator and column exist:

```sql
select '[1,0]'::vector <=> '[1,0]'::vector as distance;
```

Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/processing.ts src/lib/ai/processing.test.ts
git commit -m "Process submitted reports into cached similarity and sentiment advisories"
```

---

### Task 4: Triggers — daily cron batch + after-submit, both gated

**Files:**

- Create: `src/lib/ai/batch.ts`, `src/app/api/weekly-reports/[id]/ai/route.ts`
- Modify: `src/app/api/cron/daily/route.ts` (Workstream C) — one added call
- Modify: `…/weekly-reports/weekly-report-form.tsx` (fire-and-forget after submit, alongside the PDF call)
- Test: `src/lib/ai/batch.test.ts`

**Interfaces:**

- Produces:
  - `processPendingAiReports(limit = 20): Promise<{ processed: number; failed: number; skipped: boolean }>`
  - `POST /api/weekly-reports/[id]/ai`: owner or staff with access; returns `processWeeklyReportAi`'s result; always 200 with a result body, even when disabled.

- [ ] **Step 1: Write the failing tests**

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/ai/settings", () => ({ getAiSettings: jest.fn() }));
jest.mock("@/lib/ai/processing", () => ({ processWeeklyReportAi: jest.fn() }));

import { getAiSettings } from "@/lib/ai/settings";
import { processWeeklyReportAi } from "@/lib/ai/processing";
import { processPendingAiReports } from "@/lib/ai/batch";

beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

it("does nothing while ai:enabled is false", async () => {
  (getAiSettings as jest.Mock).mockResolvedValue({ enabled: false });
  await expect(processPendingAiReports()).resolves.toEqual({
    processed: 0,
    failed: 0,
    skipped: true,
  });
  expect(prismaMock.weeklyReport.findMany).not.toHaveBeenCalled();
});

it("processes unprocessed reports one at a time, capped, continuing past failures", async () => {
  (getAiSettings as jest.Mock).mockResolvedValue({ enabled: true });
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    { id: "a" },
    { id: "b" },
    { id: "c" },
  ] as never);
  (processWeeklyReportAi as jest.Mock)
    .mockResolvedValueOnce({ processed: true })
    .mockRejectedValueOnce(new Error("quota"))
    .mockResolvedValueOnce({ processed: false, reason: "Report not submitted" });

  await expect(processPendingAiReports(20)).resolves.toEqual({
    processed: 1,
    failed: 1,
    skipped: false,
  });
  expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ aiProcessedAt: null }), take: 20 })
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/ai/batch.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/ai/batch.ts`:

```ts
import { WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAiSettings } from "@/lib/ai/settings";
import { processWeeklyReportAi } from "@/lib/ai/processing";

// Daily catch-up (FR-NT-05's single Hobby cron). Sequential and capped to
// stay inside Gemini free-tier rate limits and the function's maxDuration.
export async function processPendingAiReports(limit = 20) {
  const settings = await getAiSettings();
  if (!settings.enabled) return { processed: 0, failed: 0, skipped: true };

  const candidates = await prisma.weeklyReport.findMany({
    where: {
      aiProcessedAt: null,
      status: {
        in: [
          WeeklyReportStatus.PENDING,
          WeeklyReportStatus.APPROVED,
          WeeklyReportStatus.REGARDED,
          WeeklyReportStatus.RETURNED,
        ],
      },
    },
    orderBy: { weekStart: "asc" },
    take: limit,
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;
  for (const { id } of candidates) {
    try {
      const result = await processWeeklyReportAi(id);
      if (result.processed) processed += 1;
    } catch (error) {
      console.error("AI processing failed", { weeklyReportId: id, error });
      failed += 1;
    }
  }
  return { processed, failed, skipped: false };
}
```

In Workstream C's `src/app/api/cron/daily/route.ts`, after `runDailyNotifications`, add `const ai = await processPendingAiReports();` and return `{ ...result, ai }`. Extend that route's test mock with `jest.mock("@/lib/ai/batch", () => ({ processPendingAiReports: jest.fn().mockResolvedValue({ processed: 0, failed: 0, skipped: true }) }))`.

`src/app/api/weekly-reports/[id]/ai/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { getWeeklyReport } from "@/lib/services/weeklyReportService";
import { processWeeklyReportAi } from "@/lib/ai/processing";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fire-and-forget hook called by the student form right after submit, so
// faculty usually see the advisory immediately; the daily cron catches up
// anything this misses. Provider failures are reported in the body, not as
// a 5xx — the submission itself already succeeded.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    const report = await getWeeklyReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertCanAccessStudent(user, report.studentProfileId);
    try {
      return NextResponse.json(await processWeeklyReportAi(params.id));
    } catch (error) {
      console.error("AI processing failed", { weeklyReportId: params.id, error });
      return NextResponse.json({
        processed: false,
        reason: "AI provider unavailable; will retry in the daily run",
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
```

In `weekly-report-form.tsx` `onSubmit`, next to the PDF call: `void fetch(\`/api/weekly-reports/${weeklyReportId}/ai\`, { method: "POST" });`

- [ ] **Step 4: Run tests**

Run: `npx jest && npx tsc --noEmit && npx next lint`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/batch.ts src/lib/ai/batch.test.ts "src/app/api/weekly-reports/[id]/ai" src/app/api/cron "src/app/(dashboard)/students/[studentProfileId]/weekly-reports/weekly-report-form.tsx"
git commit -m "Run AI advisories from the daily cron and after submission, gated by settings"
```

---

### Task 5: Golden-set evaluation, threshold calibration, and the enable gate (NFR-AI-01..03)

**Files:**

- Create: `docs/ai/golden-set.template.csv`, `scripts/ai-golden-eval.ts`, `src/lib/ai/admin.ts`, `src/app/api/config/ai/route.ts`, `src/app/(dashboard)/users/ai-settings-form.tsx` (Super Admin only)
- Test: `src/lib/ai/admin.test.ts`

**Interfaces:**

- Produces:
  - `previewThreshold(threshold: number): Promise<EvalResult>` (recomputes from stored `ai:golden_scores`, no API calls)
  - `setThreshold(threshold: number, actingUserId: string): Promise<EvalResult>` (range-checked; audit log includes P/R; NFR-AI-03)
  - `setAiEnabled(enabled: boolean, privacyApprovedBy: string | null, actingUserId: string): Promise<void>` (enable requires `privacyApprovedBy` **and** `lastEval.passes` at the current threshold)
  - `class AiConfigError extends Error` (→ 400)
  - Script: `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ai-golden-eval.ts docs/ai/golden-set.csv`. It embeds each pair (real Gemini calls, run by Jay), stores `ai:golden_scores` and `ai:last_eval`, and writes `docs/ai/eval-report-YYYY-MM-DD.md` with the confusion matrix (the NFR-AI-02 deliverable).

- [ ] **Step 1: Write the failing tests**

```ts
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { AiConfigError, previewThreshold, setAiEnabled, setThreshold } from "@/lib/ai/admin";

beforeEach(() => resetPrismaMock());

const scores = [...Array(15)]
  .map(() => ({ score: 0.9, label: "DUPLICATE" }))
  .concat([...Array(15)].map(() => ({ score: 0.3, label: "BOILERPLATE" })));

function mockConfig(entries: Record<string, unknown>) {
  prismaMock.systemConfig.findMany.mockResolvedValue(
    Object.entries(entries).map(([configKey, configValue]) => ({ configKey, configValue })) as never
  );
  prismaMock.systemConfig.findUnique.mockImplementation((({
    where,
  }: {
    where: { configKey: string };
  }) =>
    Promise.resolve(
      where.configKey in entries ? { configValue: entries[where.configKey] } : null
    )) as never);
}

it("previews precision/recall at a new threshold without calling the model", async () => {
  mockConfig({ "ai:golden_scores": scores });
  const r = await previewThreshold(0.8);
  expect(r).toEqual(
    expect.objectContaining({ threshold: 0.8, precision: 1, recall: 1, passes: true })
  );
});

it("rejects an out-of-range threshold", async () => {
  mockConfig({ "ai:golden_scores": scores });
  await expect(setThreshold(0.95, "admin-1")).rejects.toThrow(AiConfigError);
  await expect(setThreshold(0.5, "admin-1")).rejects.toThrow(AiConfigError);
  expect(prismaMock.systemConfig.upsert).not.toHaveBeenCalled();
});

it("records the threshold change with its precision/recall in the audit log (NFR-AI-03)", async () => {
  mockConfig({ "ai:golden_scores": scores });
  await setThreshold(0.75, "admin-1");
  expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: "AI_THRESHOLD_CHANGED",
        detail: expect.objectContaining({ threshold: 0.75, precision: 1, recall: 1 }),
      }),
    })
  );
});

it("refuses to enable AI without a privacy approval", async () => {
  mockConfig({ "ai:last_eval": { threshold: 0.7, passes: true } });
  await expect(setAiEnabled(true, null, "admin-1")).rejects.toThrow(/privacy/i);
});

it("refuses to enable AI without a passing evaluation at the current threshold", async () => {
  mockConfig({ "ai:last_eval": { threshold: 0.7, passes: false } });
  await expect(setAiEnabled(true, "Prof. Fernandez", "admin-1")).rejects.toThrow(
    /precision|evaluation/i
  );
});

it("can always disable AI", async () => {
  mockConfig({});
  await expect(setAiEnabled(false, null, "admin-1")).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/ai/admin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/lib/ai/admin.ts`

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { evaluateThreshold, type EvalResult, type LabeledScore } from "@/lib/ai/evaluation";
import { AI_KEYS, getAiSettings, THRESHOLD_MAX, THRESHOLD_MIN } from "@/lib/ai/settings";

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

async function upsertConfig(configKey: string, configValue: unknown, actingUserId: string) {
  await prisma.systemConfig.upsert({
    where: { configKey },
    create: {
      configKey,
      configValue: configValue as Prisma.InputJsonValue,
      updatedBy: actingUserId,
    },
    update: { configValue: configValue as Prisma.InputJsonValue, updatedBy: actingUserId },
  });
}

async function loadGoldenScores(): Promise<LabeledScore[]> {
  const row = await prisma.systemConfig.findUnique({
    where: { configKey: AI_KEYS.goldenScores },
    select: { configValue: true },
  });
  if (!Array.isArray(row?.configValue)) {
    throw new AiConfigError(
      "No golden-set scores yet — run scripts/ai-golden-eval.ts first (NFR-AI-01)"
    );
  }
  return row!.configValue as unknown as LabeledScore[];
}

function assertRange(threshold: number) {
  if (!(threshold >= THRESHOLD_MIN && threshold <= THRESHOLD_MAX)) {
    throw new AiConfigError(
      `Threshold must be between ${THRESHOLD_MIN} and ${THRESHOLD_MAX} (FR-AI-02)`
    );
  }
}

// NFR-AI-03 step 1: show the figures before anything changes.
export async function previewThreshold(threshold: number): Promise<EvalResult> {
  assertRange(threshold);
  return evaluateThreshold(await loadGoldenScores(), threshold);
}

// NFR-AI-03 step 2: confirm — stores threshold + its eval, audit-logged.
export async function setThreshold(threshold: number, actingUserId: string): Promise<EvalResult> {
  const result = await previewThreshold(threshold);
  await upsertConfig(AI_KEYS.threshold, threshold, actingUserId);
  await upsertConfig(AI_KEYS.lastEval, result, actingUserId);
  await logEvent({
    userId: actingUserId,
    action: "AI_THRESHOLD_CHANGED",
    entityType: "SystemConfig",
    detail: {
      threshold,
      precision: result.precision,
      recall: result.recall,
      passes: result.passes,
    },
  });
  return result;
}

// D5 + NFR-AI-02 gate. Disabling is always allowed.
export async function setAiEnabled(
  enabled: boolean,
  privacyApprovedBy: string | null,
  actingUserId: string
) {
  if (enabled) {
    if (!privacyApprovedBy?.trim()) {
      throw new AiConfigError("Record who approved the data-privacy basis (D5) before enabling AI");
    }
    const settings = await getAiSettings();
    const evalRow = await prisma.systemConfig.findUnique({
      where: { configKey: AI_KEYS.lastEval },
      select: { configValue: true },
    });
    const lastEval = evalRow?.configValue as unknown as EvalResult | undefined;
    if (!lastEval?.passes || lastEval.threshold !== settings.similarityThreshold) {
      throw new AiConfigError(
        "A passing golden-set evaluation (≥80% precision, ≥70% recall, ≥30 pairs) at the current threshold is required (NFR-AI-02)"
      );
    }
    await upsertConfig(AI_KEYS.privacyApprovedBy, privacyApprovedBy.trim(), actingUserId);
  }
  await upsertConfig(AI_KEYS.enabled, enabled, actingUserId);
  await logEvent({
    userId: actingUserId,
    action: enabled ? "AI_ENABLED" : "AI_DISABLED",
    entityType: "SystemConfig",
    detail: { privacyApprovedBy: privacyApprovedBy ?? null },
  });
}
```

Add `AiConfigError` to `BAD_REQUEST_ERRORS` in `src/lib/utils/apiError.ts`.

`src/app/api/config/ai/route.ts` (`requireRole([SUPER_ADMIN])` on every method):

- `GET` → `getAiSettings()`
- `POST { previewThreshold }` → `previewThreshold(n)`
- `PATCH { threshold }` → `setThreshold(n, user.id)`
- `PATCH { enabled, privacyApprovedBy }` → `setAiEnabled(...)`

Validate the body with zod: a union of `{ threshold: number }` and `{ enabled: boolean, privacyApprovedBy: string | null }`.

`docs/ai/golden-set.template.csv`:

```csv
pairId,textA,textB,label
1,"Built the login page with form validation","Built the login page and added validation to the form",DUPLICATE
2,"Attended the daily stand-up meeting","Attended the daily stand-up meeting",BOILERPLATE
```

(The adviser fills **≥ 30** rows with real anonymised student pairs, both classes represented. `BOILERPLATE` = legitimate repeated phrasing that must **not** be flagged.)

`scripts/ai-golden-eval.ts`:

1. Read the CSV (split lines, handle quoted fields with a small parser, and reject rows whose label isn't DUPLICATE/BOILERPLATE).
2. For each pair, call `embedText` on both texts and compute cosine similarity in JS: `dot / (|a||b|)`.
3. Build `LabeledScore[]`.
4. Store `ai:golden_scores` (scores and labels only, never the texts) and `ai:last_eval` at the current threshold via Prisma.
5. Write `docs/ai/eval-report-<date>.md` with the confusion matrix table, precision, recall, pass/fail, and a sweep over 0.60–0.85 in 0.05 steps. This is the NFR-AI-02 deliverable.

Use relative imports and a plain `PrismaClient`, as in `prisma/seed-holidays.ts`.

`ai-settings-form.tsx`, a Super Admin card on `/users`:

- Shows the enabled toggle, the threshold, and the last evaluation's P/R.
- Threshold input → **Preview** (POST) → shows P/R → **Confirm** (PATCH). The Confirm button stays disabled until a preview at that exact value has been shown (NFR-AI-03).
- Enable checkbox plus a "Privacy approved by" text input. Server errors are shown verbatim.

- [ ] **Step 4: Run tests**

Run: `npx jest && npx tsc --noEmit && npx next lint`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/admin.ts src/lib/ai/admin.test.ts src/app/api/config/ai src/lib/utils/apiError.ts scripts/ai-golden-eval.ts docs/ai "src/app/(dashboard)/users"
git commit -m "Add golden-set evaluation, NFR-AI-03 threshold calibration, and AI enable gate"
```

---

### Task 6: Faculty review advisory panel + sentiment trend (FR-AI-04/06/07, NFR-AI-04)

**Files:**

- Create: `src/lib/ai/display.ts`
- Modify: `…/weekly-reports/[weeklyReportId]/review/page.tsx`, `src/app/(dashboard)/page.tsx` (faculty branch)
- Test: `src/lib/ai/display.test.ts`

**Interfaces:**

- Produces: `getAdvisoryView(report: { similarityFlag: boolean; similarityScore: unknown; sentimentLabel: string | null; sentimentConfidence: unknown; sentimentReasoning: string | null; aiProcessedAt: Date | null }, settings: AiSettings): { similarity: { score: number } | null; sentiment: { label: string; confidence: number; reasoning: string | null } | null; pending: boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
import { getAdvisoryView } from "@/lib/ai/display";

const settings = {
  enabled: true,
  similarityThreshold: 0.7,
  minSentimentConfidence: 0.6,
  privacyApprovedBy: "x",
  lastEval: null,
};
const base = {
  similarityFlag: false,
  similarityScore: null,
  sentimentLabel: null,
  sentimentConfidence: null,
  sentimentReasoning: null,
  aiProcessedAt: new Date(),
};

it("suppresses low-confidence sentiment (NFR-AI-04)", () => {
  const view = getAdvisoryView(
    { ...base, sentimentLabel: "NEGATIVE", sentimentConfidence: 0.55 },
    settings
  );
  expect(view.sentiment).toBeNull();
});

it("shows confident sentiment with its reasoning", () => {
  const view = getAdvisoryView(
    {
      ...base,
      sentimentLabel: "NEGATIVE",
      sentimentConfidence: 0.8,
      sentimentReasoning: "Mentions frustration.",
    },
    settings
  );
  expect(view.sentiment).toEqual({
    label: "NEGATIVE",
    confidence: 0.8,
    reasoning: "Mentions frustration.",
  });
});

it("only shows similarity when flagged", () => {
  expect(getAdvisoryView({ ...base, similarityScore: 0.5 }, settings).similarity).toBeNull();
  expect(
    getAdvisoryView({ ...base, similarityFlag: true, similarityScore: 0.83 }, settings).similarity
  ).toEqual({ score: 0.83 });
});

it("marks unprocessed reports as pending only while AI is enabled", () => {
  expect(getAdvisoryView({ ...base, aiProcessedAt: null }, settings).pending).toBe(true);
  expect(
    getAdvisoryView({ ...base, aiProcessedAt: null }, { ...settings, enabled: false }).pending
  ).toBe(false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/ai/display.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/lib/ai/display.ts`

```ts
import type { AiSettings } from "@/lib/ai/settings";

// Pure view-model for the faculty Review page (FR-AI-07). Reads only cached
// columns (FR-AI-05) and applies NFR-AI-04's confidence floor.
export function getAdvisoryView(
  report: {
    similarityFlag: boolean;
    similarityScore: unknown;
    sentimentLabel: string | null;
    sentimentConfidence: unknown;
    sentimentReasoning: string | null;
    aiProcessedAt: Date | null;
  },
  settings: AiSettings
) {
  const confidence = report.sentimentConfidence == null ? null : Number(report.sentimentConfidence);
  return {
    similarity:
      report.similarityFlag && report.similarityScore != null
        ? { score: Number(report.similarityScore) }
        : null,
    sentiment:
      report.sentimentLabel && confidence !== null && confidence >= settings.minSentimentConfidence
        ? { label: report.sentimentLabel, confidence, reasoning: report.sentimentReasoning }
        : null,
    pending: settings.enabled && report.aiProcessedAt === null,
  };
}
```

Review page: replace the current inline `similarityFlag`/`sentimentLabel` checks with `getAdvisoryView(report, await getAiSettings())`.

- Render the existing two advisory blocks from `view.similarity` / `view.sentiment`, adding `view.sentiment.reasoning` under the label.
- Keep the line "AI-assisted, advisory only — it never decides the outcome of this review." (FR-AI-06).
- When `view.pending`, show "AI advisory pending — processed within 24 hours".
- Render nothing AI-related when AI is disabled and nothing was ever processed.

Faculty dashboard (FR-AI-04, **Could**; do it only if time allows):

- Add a "Sentiment trend (last 4 weeks)" StatCard row for the faculty member's students. Count NEGATIVE vs. total among confident (≥ floor) sentiments per week, using one Prisma `groupBy` over `weeklyReport` filtered by the faculty member's students and `aiProcessedAt` not null.
- Hide the card entirely when AI is disabled.

- [ ] **Step 4: Run everything**

Run: `npx jest && npx tsc --noEmit && npx next lint && npx next build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/display.ts src/lib/ai/display.test.ts "src/app/(dashboard)"
git commit -m "Show gated, confidence-filtered AI advisories on faculty review and dashboard"
```

---

## Self-review (completed)

- **Spec coverage:**
  - FR-AI-01: Tasks 2–3.
  - FR-AI-02: the threshold and its range (Tasks 1 and 5).
  - FR-AI-03: sentiment, confidence and reasoning (Tasks 1–3).
  - FR-AI-04: Task 6 (Could).
  - FR-AI-05: cached; only the cron and POST route call the model (Tasks 3–4).
  - FR-AI-06: no status writes, asserted in a Task 3 test.
  - FR-AI-07: Task 6.
  - NFR-AI-01..03: Task 5.
  - NFR-AI-04: Task 6.
  - D5 privacy: the scrubber (Task 2) and the enable gate (Task 5).
- **Placeholders:**
  - The eval script's CSV parsing and report writing are given as precise numbered steps rather than full code. That's a one-off operator script, not app code, and it's covered by `evaluateThreshold`'s tests.
  - The settings form is a thin client over a fully specified route.
- **Types:** `EvalResult` and `LabeledScore` are consistent across Tasks 1 and 5; `AiSettings` across Tasks 1, 3, 4 and 6.
- **Review Focus:** all five map to named tests in Tasks 2, 3, 4 and 5.
