// NFR-AI-01/02: evaluate similarity detection on the adviser-labelled golden
// set. Makes real Gemini calls (texts are PII-scrubbed by embedText), stores
// only the scores and labels (never the texts) as ai:golden_scores, stores
// ai:last_eval at the current threshold, and writes the evaluation report.
//
//   TS_NODE_BASEURL=. npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"commonjs"}' scripts/ai-golden-eval.ts docs/ai/golden-set.csv
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { embedText } from "@/lib/services/aiService";
import { evaluateThreshold, type LabeledScore } from "@/lib/ai/evaluation";
import { cosine, parseGoldenCsv } from "@/lib/ai/golden";
import { AI_KEYS, getAiSettings } from "@/lib/ai/settings";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: ai-golden-eval.ts <golden-set.csv>");
  const rows = parseGoldenCsv(readFileSync(file, "utf8"));

  const scores: LabeledScore[] = [];
  for (const row of rows) {
    const [a, b] = [await embedText(row.textA), await embedText(row.textB)];
    scores.push({ score: Math.round(cosine(a, b) * 1000) / 1000, label: row.label });
    process.stdout.write(".");
  }
  console.log();

  const { similarityThreshold } = await getAiSettings();
  const result = evaluateThreshold(scores, similarityThreshold);
  for (const [configKey, configValue] of [
    [AI_KEYS.goldenScores, scores],
    [AI_KEYS.lastEval, result],
  ] as const) {
    await prisma.systemConfig.upsert({
      where: { configKey },
      create: { configKey, configValue: configValue as unknown as Prisma.InputJsonValue },
      update: { configValue: configValue as unknown as Prisma.InputJsonValue },
    });
  }

  const sweep = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85].map((t) => evaluateThreshold(scores, t));
  const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync("docs/ai", { recursive: true });
  const report = [
    `# AI similarity evaluation — ${date}`,
    "",
    `Golden set: ${result.pairCount} labelled pairs (${file}). Embedding model: ${process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001"}.`,
    "",
    `## At the current threshold (${similarityThreshold})`,
    "",
    "| | Flagged | Not flagged |",
    "| --- | --- | --- |",
    `| DUPLICATE | ${result.tp} (TP) | ${result.fn} (FN) |`,
    `| BOILERPLATE | ${result.fp} (FP) | ${result.tn} (TN) |`,
    "",
    `Precision ${pct(result.precision)} (target ≥ 80%), recall ${pct(result.recall)} (target ≥ 70%): **${result.passes ? "PASS" : "FAIL"}**.`,
    "",
    "## Threshold sweep",
    "",
    "| Threshold | Precision | Recall | Passes |",
    "| --- | --- | --- | --- |",
    ...sweep.map(
      (r) =>
        `| ${r.threshold} | ${pct(r.precision)} | ${pct(r.recall)} | ${r.passes ? "yes" : "no"} |`
    ),
    "",
  ].join("\n");
  writeFileSync(`docs/ai/eval-report-${date}.md`, report);
  console.log(`Wrote docs/ai/eval-report-${date}.md — ${result.passes ? "PASS" : "FAIL"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
