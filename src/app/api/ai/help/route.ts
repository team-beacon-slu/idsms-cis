import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/session";
import { connectionFor, runJob } from "@/lib/ai/jobs";
import { chatJson } from "@/lib/services/ai/aiService";
import { buildPrompt } from "@/lib/ai/guard";
import { scrubPii } from "@/lib/ai/scrubPii";
import { helpQuestionsFor } from "@/app/(dashboard)/help/faq";
import { handleApiError } from "@/lib/utils/apiError";

const answerSchema = z.object({ id: z.number().int().nullable() });

// Job 9: which help question (for this person's role) answers theirs, or none. It only
// points to existing help text; it never writes an answer.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const { question } = z
      .object({ question: z.string().trim().min(1).max(300) })
      .parse(await req.json());
    const conn = await connectionFor("help", user);
    if (!conn) return NextResponse.json({ q: null, ai: false });
    const questions = helpQuestionsFor(user.role);
    const prompt = buildPrompt(
      "The entries are the questions on a help page. The user asked (in English, Filipino or " +
        `Taglish): "${scrubPii(question).replace(/"/g, "'")}". Pick the ONE entry that answers ` +
        "it, or null if none does. Never pick one that only shares a word.",
      questions,
      '{"id": <entry id or null>}'
    );
    const parsed = answerSchema.safeParse(await runJob("help", () => chatJson(conn, prompt)));
    const id = parsed.success ? parsed.data.id : null;
    return NextResponse.json({ q: id ? (questions[id - 1] ?? null) : null, ai: true });
  } catch (error) {
    return handleApiError(error);
  }
}
