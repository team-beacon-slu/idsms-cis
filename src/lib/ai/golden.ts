// NFR-AI-01: the adviser-labelled golden set (CSV) and the similarity maths
// the evaluation script uses. Pure.

export interface GoldenRow {
  pairId: string;
  textA: string;
  textB: string;
  label: "DUPLICATE" | "BOILERPLATE";
}

// Minimal RFC 4180 line splitter: quoted fields may hold commas and "".
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseGoldenCsv(csv: string): GoldenRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(1).map((line, i) => {
    const [pairId, textA, textB, label] = splitCsvLine(line);
    if (label !== "DUPLICATE" && label !== "BOILERPLATE") {
      throw new Error(`line ${i + 2}: label must be DUPLICATE or BOILERPLATE, got "${label}"`);
    }
    return { pairId, textA, textB, label };
  });
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
