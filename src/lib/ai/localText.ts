// Text mining done here instead of by the model, to keep Gemini's free-tier calls for
// what needs a model. Both work on the intern's own words and quote them exactly.

const STOP = new Set(
  (
    "a an and are as at be been but by for from had has have i in into is it its me my of " +
    "on or our so that the their them then there they this to was we were will with you " +
    "ako ang at ay mga na ng sa si ko ang po din rin lang"
  ).split(" ")
);

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length >= 3);
}

// The week's summary: the 2-3 sentences that carry the most of the week's distinctive
// words (TF-IDF over the week's days, one sentence per day at most), in day order. What
// the summary job asked the model to do, without the call.
export function extractiveSummary(
  days: { id: string; accomplishments: string }[],
  max = 3
): { entryId: string; quote: string }[] {
  const dayWords = days.map((d) => new Set(words(d.accomplishments)));
  const df = new Map<string, number>();
  for (const set of dayWords) for (const w of set) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + days.length / (df.get(w) ?? 1));

  const scored = days.flatMap((d, dayIndex) =>
    sentences(d.accomplishments).map((quote) => {
      const ws = words(quote);
      const unique = new Set(ws);
      // Sum of distinct terms' weight, damped by length so a run-on sentence can't win alone.
      const score = [...unique].reduce((s, w) => s + idf(w), 0) / Math.sqrt(ws.length);
      return { entryId: d.id, quote, score, dayIndex };
    })
  );
  const picked: typeof scored = [];
  for (const s of [...scored].sort((a, b) => b.score - a.score)) {
    if (picked.length >= max) break;
    if (picked.some((p) => p.entryId === s.entryId)) continue;
    picked.push(s);
  }
  return picked
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map(({ entryId, quote }) => ({ entryId, quote }));
}

// Words that make a week worth the tone model's look (English and Filipino). Most weeks
// have none, and then the model isn't asked at all. shortcut: a word list misses what it
// doesn't name; add the words advisers report missing, or drop the filter if calls allow.
const TONE_CUES = [
  "stress",
  "stressed",
  "pressure",
  "overwhelm",
  "burnout",
  "burned out",
  "tired",
  "exhausted",
  "anxious",
  "anxiety",
  "scared",
  "afraid",
  "unsafe",
  "danger",
  "injur",
  "hurt",
  "accident",
  "harass",
  "bully",
  "shout",
  "yell",
  "insult",
  "mistreat",
  "abuse",
  "threat",
  "unfair",
  "unpaid",
  "overtime again",
  "no work",
  "nothing to do",
  "idle",
  "no task",
  "wala akong",
  "walang ginagawa",
  "pagod",
  "takot",
  "sigaw",
  "napagalitan",
  "sinigawan",
  "hindi pinapansin",
  "cry",
  "crying",
  "quit",
  "sick",
  "absent again",
];

export function toneWorthAsking(texts: string[]): boolean {
  const all = texts.join(" \n").toLowerCase();
  return TONE_CUES.some((cue) => all.includes(cue));
}
