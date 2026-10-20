import { z } from "zod";

const AUTOMATIC_KEYS = ["LATE_WWR", "UNSUPPORTED_UT"];

const points = { adviser: z.number().min(0).max(100), wwr: z.number().min(0).max(100) };

const categorySchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]{1,40}$/, "Use UPPER_SNAKE_CASE keys"),
  label: z.string().trim().min(1).max(120),
  mode: z.enum(["TOTAL_AT_COUNT", "PER_INCIDENT"]),
  source: z.enum(["MANUAL", "AUTOMATIC"]),
  tiers: z
    .array(z.object({ count: z.number().int().min(1), ...points }))
    .refine((t) => t.every((x, i) => i === 0 || x.count > t[i - 1].count), {
      message: "Tier counts must go up",
    }),
  extraIfNoValidReason: z.object(points).optional(),
});

// The Super Admin's edited matrix (SystemConfig `deduction_matrix`).
export const deductionMatrixSchema = z
  .array(categorySchema)
  .min(1)
  .refine((m) => new Set(m.map((c) => c.key)).size === m.length, {
    message: "Each category needs its own key",
  })
  // IDSMS counts exactly these automatically (see automaticDeductions.ts).
  .refine(
    (m) => {
      const auto = m
        .filter((c) => c.source === "AUTOMATIC")
        .map((c) => c.key)
        .sort();
      return auto.join() === [...AUTOMATIC_KEYS].sort().join();
    },
    { message: `Keep ${AUTOMATIC_KEYS.join(" and ")} as the only AUTOMATIC categories` }
  );
