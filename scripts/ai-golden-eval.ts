// NFR-AI-01/02: run the golden set (src/lib/ai/testsets.ts) on the connection allowed to
// read interns' words, and store the result with its model. The same as Settings › AI ›
// "Run the test"; this is for running it from a terminal.
//
//   TS_NODE_BASEURL=. npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"commonjs"}' scripts/ai-golden-eval.ts
import "dotenv/config"; // Prisma 7 no longer loads .env itself
import { prisma } from "@/lib/prisma";
import { runGoldenEval } from "@/lib/ai/admin";

async function main() {
  const r = await runGoldenEval(null);
  const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
  console.log(
    `${r.model}: ${r.pairCount} pairs at ${r.threshold}: precision ${pct(r.precision)}, recall ${pct(r.recall)} -> ${r.passes ? "PASS" : "FAIL"}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
