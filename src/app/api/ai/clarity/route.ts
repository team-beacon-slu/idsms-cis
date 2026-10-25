import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { connectionFor, runJob } from "@/lib/ai/jobs";
import { chatJson } from "@/lib/services/ai/aiService";
import { buildPrompt, isAddressedToAi } from "@/lib/ai/guard";
import { QUESTIONS, QUESTION_IDS, vagueDays, type QuestionId } from "@/lib/ai/clarity";
import { handleApiError } from "@/lib/utils/apiError";

const bodySchema = z.object({
  days: z
    .array(
      z.object({
        id: z.string().max(64),
        text: z.string().max(4000),
        tools: z.string().max(500).nullish(),
      })
    )
    .max(7),
});
const answerSchema = z.object({
  days: z.array(z.object({ id: z.number().int(), questions: z.array(z.string()).max(2) })),
});

// Job 8 with the model: a second look that only picks from the same fixed questions. The
// rules' answer comes back whenever the model is off, fails or answers out of shape.
// Nothing is stored and the adviser sees none of it.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const { days } = bodySchema.parse(await req.json());
    const rules = vagueDays(days);
    const conn = await connectionFor("clarity", user);
    const readable = days.filter((d) => d.text.trim() && !isAddressedToAi(d.text));
    if (!conn || !readable.length) return NextResponse.json({ days: rules, ai: false });

    const prompt = buildPrompt(
      "For each entry of a student's internship log, decide whether it is too vague for an " +
        "adviser to understand. For vague entries choose at most 2 question ids from this list: " +
        QUESTION_IDS.map((id) => `${id} = "${QUESTIONS[id]}"`).join("; ") +
        ". Entries may be in English, Filipino or Taglish. Clear entries get no questions.",
      readable.map((d) => d.text),
      '{"days": [{"id": <entry id>, "questions": ["<question id>"]}]}'
    );
    try {
      const answer = await runJob("clarity", () => chatJson(conn, prompt));
      const parsed = answerSchema.safeParse(answer);
      if (!parsed.success) return NextResponse.json({ days: rules, ai: false });
      const ai: { id: string; questions: QuestionId[] }[] = [];
      for (const d of parsed.data.days) {
        const id = readable[d.id - 1]?.id;
        const questions = d.questions.filter((q): q is QuestionId => q in QUESTIONS);
        if (id && questions.length) ai.push({ id, questions });
      }
      return NextResponse.json({ days: ai, ai: true });
    } catch {
      return NextResponse.json({ days: rules, ai: false });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
