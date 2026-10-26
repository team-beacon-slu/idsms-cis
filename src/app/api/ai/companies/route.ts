import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { connectionFor, runJob } from "@/lib/ai/jobs";
import { chatJson } from "@/lib/services/ai/aiService";
import { buildPrompt } from "@/lib/ai/guard";
import { normalizeCompanyName } from "@/lib/services/predeployment/companyService";
import { handleApiError } from "@/lib/utils/apiError";

const MAX_COMPANIES = 250;
const answerSchema = z.object({
  pairs: z.array(z.tuple([z.number().int(), z.number().int()])).max(40),
});

// Job 12: pairs the name rules miss ("ABC Corp" and "A.B.C. Corporation"). Company names
// aren't personal data, so this uses the general connection. Suggestions only: the
// coordinator confirms every merge.
export async function POST() {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const conn = await connectionFor("companies", user);
    if (!conn) return NextResponse.json({ groups: [], ai: false });
    const companies = await prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      take: MAX_COMPANIES,
      select: {
        id: true,
        name: true,
        address: true,
        isVerified: true,
        _count: { select: { students: true, moaRecords: true } },
      },
    });
    if (companies.length < 2) return NextResponse.json({ groups: [], ai: true });
    const prompt = buildPrompt(
      "The entries are company names typed by different students. List pairs that are the SAME " +
        "organisation written differently (abbreviations, punctuation, Inc./Corp./Co., a branch " +
        "named after its parent). Different branches with different addresses still count as the " +
        "same only if the names clearly match. Skip pairs you are unsure of.",
      companies.map((c) => `${c.name} — ${c.address ?? ""}`),
      '{"pairs": [[<entry id>, <entry id>]]}'
    );
    const parsed = answerSchema.safeParse(await runJob("companies", () => chatJson(conn, prompt)));
    if (!parsed.success) return NextResponse.json({ groups: [], ai: true });
    const seen = new Set<string>();
    const groups = parsed.data.pairs
      .map(([a, b]) => [companies[a - 1], companies[b - 1]])
      .filter(
        ([a, b]) =>
          a &&
          b &&
          a.id !== b.id &&
          // The rules already group these; the AI adds only what they miss.
          normalizeCompanyName(a.name) !== normalizeCompanyName(b.name)
      )
      .filter(([a, b]) => {
        const key = [a.id, b.id].sort().join(":");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
    return NextResponse.json({ groups, ai: true });
  } catch (error) {
    return handleApiError(error);
  }
}
