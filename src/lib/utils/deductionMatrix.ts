// Workstream L2: SLU's deduction matrix (grade points in two columns, ADVISER
// and WWR) and the maths that turns a category count into points. The matrix
// itself is configuration (SystemConfig `deduction_matrix`) because the
// faculty revise it; these are the slide's values as defaults.

export type Points = { adviser: number; wwr: number };

export interface MatrixCategory {
  key: string;
  label: string;
  // TOTAL_AT_COUNT: the tier at the count is the total. PER_INCIDENT: tiers add up.
  mode: "TOTAL_AT_COUNT" | "PER_INCIDENT";
  source: "MANUAL" | "AUTOMATIC";
  tiers: Array<{ count: number } & Points>; // ascending; empty until the faculty fill it in
  extraIfNoValidReason?: Points;
}

const tier = (count: number, adviser: number, wwr: number) => ({ count, adviser, wwr });

export const DEFAULT_MATRIX: MatrixCategory[] = [
  {
    key: "WRITTEN_WARNING",
    label: "Written warnings",
    mode: "TOTAL_AT_COUNT",
    source: "MANUAL",
    tiers: [tier(1, 2, 2), tier(2, 3, 3)],
  },
  {
    key: "DEMERIT",
    label: "Demerits",
    mode: "TOTAL_AT_COUNT",
    source: "MANUAL",
    tiers: [tier(1, 3, 3), tier(2, 4, 4), tier(3, 5, 5), tier(4, 6, 7)],
  },
  {
    key: "LATE_WWR",
    label: "Late or missing weekly work reports / monthly journals",
    mode: "TOTAL_AT_COUNT",
    source: "AUTOMATIC",
    tiers: [tier(1, 3, 5), tier(2, 4, 6), tier(3, 5, 7), tier(4, 6, 8)],
    extraIfNoValidReason: { adviser: 2, wwr: 2 },
  },
  {
    key: "UNSUPPORTED_UT",
    label: "Unsupported undertime / absences",
    mode: "TOTAL_AT_COUNT",
    source: "AUTOMATIC",
    tiers: [tier(1, 2, 2), tier(2, 3, 3), tier(3, 4, 4), tier(4, 5, 5)],
    extraIfNoValidReason: { adviser: 2, wwr: 2 },
  },
  {
    key: "MAJOR_VIOLATION",
    label: "Major violations",
    mode: "TOTAL_AT_COUNT",
    source: "MANUAL",
    tiers: [tier(1, 4, 5), tier(2, 5, 6)],
  },
  { key: "SUSPENSION", label: "Suspensions", mode: "TOTAL_AT_COUNT", source: "MANUAL", tiers: [] },
];

// Automatic item types → the matrix category they count toward.
const AUTOMATIC_CATEGORY: Record<string, string> = {
  LATE_WWR: "LATE_WWR",
  MISSING_WWR: "LATE_WWR", // "late or missing" share one row
  UNSUPPORTED_UT: "UNSUPPORTED_UT",
};

export interface TallyRow extends Points {
  key: string;
  label: string;
  count: number;
}

// Per-category counts and points for one intern: active manual records (by
// weight) plus non-excused automatic items. IDSMS reports these; it does not
// compute a grade.
export function tallyDeductions(
  matrix: MatrixCategory[],
  manual: Array<{ categoryKey: string; weight: number }>,
  automatic: Array<{ itemType: string; unjustified: boolean }>
): { rows: TallyRow[]; totals: Points } {
  const rows = matrix.map((cat) => {
    const auto = automatic.filter((a) => AUTOMATIC_CATEGORY[a.itemType] === cat.key);
    const count =
      cat.source === "MANUAL"
        ? manual.filter((m) => m.categoryKey === cat.key).reduce((s, m) => s + m.weight, 0)
        : auto.length;
    const unjustified = cat.source === "AUTOMATIC" ? auto.filter((a) => a.unjustified).length : 0;
    return { key: cat.key, label: cat.label, count, ...categoryDeduction(cat, count, unjustified) };
  });
  return {
    rows,
    totals: rows.reduce((t, r) => ({ adviser: t.adviser + r.adviser, wwr: t.wwr + r.wwr }), {
      adviser: 0,
      wwr: 0,
    }),
  };
}

// Points for `count` occurrences, plus the extra for unjustified ones.
// A count above the last tier uses the last tier.
export function categoryDeduction(
  cat: MatrixCategory,
  count: number,
  noValidReasonCount: number
): Points {
  const extra = cat.extraIfNoValidReason ?? { adviser: 0, wwr: 0 };
  const base: Points = { adviser: 0, wwr: 0 };
  const tierAt = (n: number) => [...cat.tiers].reverse().find((t) => t.count <= n);
  if (count > 0 && cat.tiers.length > 0) {
    if (cat.mode === "TOTAL_AT_COUNT") {
      const t = tierAt(count);
      if (t) Object.assign(base, { adviser: t.adviser, wwr: t.wwr });
    } else {
      for (let n = 1; n <= count; n += 1) {
        const t = tierAt(n);
        if (t) {
          base.adviser += t.adviser;
          base.wwr += t.wwr;
        }
      }
    }
  }
  return {
    adviser: base.adviser + extra.adviser * noValidReasonCount,
    wwr: base.wwr + extra.wwr * noValidReasonCount,
  };
}
