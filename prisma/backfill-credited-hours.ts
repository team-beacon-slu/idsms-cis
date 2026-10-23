// Workstream L1, run once after migration 008 is applied: stores SLU-credited
// hours on every existing daily entry and refreshes weekly totals and rendered
// hours. Without it, legacy rows fall back to min(actual, scheduled), which
// drops overtime approved under the old deviation flow (legacy validated OT
// has no minutes, so it is credited uncapped here).
//
//   TS_NODE_BASEURL=. npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"commonjs"}' prisma/backfill-credited-hours.ts           # dry run
//   TS_NODE_BASEURL=. npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"commonjs"}' prisma/backfill-credited-hours.ts --apply   # write
//
// Prints each student whose rendered hours change (for the PR / adviser).
import "dotenv/config"; // Prisma 7 no longer loads .env itself
import { prisma } from "@/lib/prisma";
import { recomputeCreditedHours } from "@/lib/services/reports/weeklyReportService";

async function main() {
  const apply = process.argv.includes("--apply");
  const students = await prisma.studentProfile.findMany({
    where: { weeklyReports: { some: {} } },
    select: { id: true, studentNumber: true, renderedHours: true },
    orderBy: { studentNumber: "asc" },
  });
  console.log(`${students.length} students with weekly reports${apply ? "" : " (dry run)"}`);
  if (!apply) return;

  for (const s of students) {
    await recomputeCreditedHours(s.id);
    const after = await prisma.studentProfile.findUniqueOrThrow({
      where: { id: s.id },
      select: { renderedHours: true },
    });
    const before = Number(s.renderedHours ?? 0);
    const now = Number(after.renderedHours ?? 0);
    if (before !== now) console.log(`${s.studentNumber}: ${before} → ${now} hrs`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
