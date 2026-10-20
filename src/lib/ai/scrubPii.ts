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
