// Job 8, the clarity coach (ai-assist-plan §6): fixed questions on vague days, triggered by
// rules that read English and Taglish. Warn only, never rewrites, and the adviser doesn't
// see it. Works with no model at all; the AI (when on) only picks from the same questions.
export const QUESTIONS = {
  task: "What exactly did you work on? Name the task or system.",
  tool: "What tool, software or equipment did you use?",
  result: "What was the result: what got finished, fixed or made?",
  who: "Who was it for: which team, office or client?",
} as const;
export type QuestionId = keyof typeof QUESTIONS;
export const QUESTION_IDS = Object.keys(QUESTIONS) as QuestionId[];

const GENERIC = [
  // English
  /\b(did|do|doing) (my|the|some|various|usual|daily) (tasks?|work|stuff|job)\b/i,
  /\bsame as (yesterday|before|last week)\b/i,
  /\b(various|misc(ellaneous)?|other) tasks?\b/i,
  /\b(nothing much|no task|no work|idle)\b/i,
  /^\s*(assisted|helped|worked|observed|trained|training)\.?\s*$/i,
  // Taglish / Filipino
  /\b(same lang|ganun pa ?rin|wala (masyado|gaanong)|walang ginawa)\b/i,
  /\b(tumulong|nag-?assist|nag-?help) lang\b/i,
  /\b(ginawa|gawa) (ang|yung) (trabaho|task|utos)\b/i,
  /\b(sinunod|ginawa) (ang|yung) (inutos|utos)\b/i,
];
const RESULT =
  /\b(finish|finished|complet|fixed|creat|made|built|wrote|submitted|deployed|installed|configured|encoded|prepared|resolved|tested|updated|natapos|tapos|nagawa|naayos|ginawa ko|nai-?submit|na-?install|na-?configure)/i;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Pure: which days need a question, and which (at most two).
export function vagueDays(
  days: { id: string; text: string; tools?: string | null }[]
): { id: string; questions: QuestionId[] }[] {
  const out: { id: string; questions: QuestionId[] }[] = [];
  const seen = new Map<string, number>();
  for (const d of days) {
    const text = d.text.trim();
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const d of days) {
    const text = d.text.trim();
    if (!text) continue;
    const q = new Set<QuestionId>();
    const short = wordCount(text) < 6;
    const generic = GENERIC.some((re) => re.test(text));
    const repeated = (seen.get(text.toLowerCase().replace(/\s+/g, " ")) ?? 0) > 1;
    if (short || generic || repeated) q.add("task");
    if ((short || generic) && !RESULT.test(text)) q.add("result");
    if (q.size && !d.tools?.trim()) q.add("tool");
    if (q.size) out.push({ id: d.id, questions: [...q].slice(0, 2) });
  }
  return out;
}
