import { categoryDeduction, DEFAULT_MATRIX, type MatrixCategory } from "./deductionMatrix";
import { deductionMatrixSchema } from "@/lib/validators/deductionMatrix";

const cat = (key: string) => DEFAULT_MATRIX.find((c) => c.key === key)!;

describe("categoryDeduction (SLU deduction matrix slide)", () => {
  it("is 0 at count 0", () => {
    expect(categoryDeduction(cat("DEMERIT"), 0, 0)).toEqual({ adviser: 0, wwr: 0 });
  });

  it("reads the total at the count: 3 demerits = 5/5, 4 demerits = 6/7", () => {
    expect(categoryDeduction(cat("DEMERIT"), 3, 0)).toEqual({ adviser: 5, wwr: 5 });
    expect(categoryDeduction(cat("DEMERIT"), 4, 0)).toEqual({ adviser: 6, wwr: 7 });
  });

  it("uses the last tier above the last count", () => {
    expect(categoryDeduction(cat("DEMERIT"), 6, 0)).toEqual({ adviser: 6, wwr: 7 });
  });

  it("adds 2 points per item with no valid reason (late WWR 2 = 4/6 + 2/2 each)", () => {
    expect(categoryDeduction(cat("LATE_WWR"), 2, 1)).toEqual({ adviser: 6, wwr: 8 });
  });

  it("sums the tiers in PER_INCIDENT mode, repeating the last tier", () => {
    const perIncident: MatrixCategory = { ...cat("DEMERIT"), mode: "PER_INCIDENT" };
    expect(categoryDeduction(perIncident, 3, 0)).toEqual({ adviser: 12, wwr: 12 }); // 3+4+5
    expect(categoryDeduction(perIncident, 5, 0)).toEqual({ adviser: 24, wwr: 26 }); // +6/7 +6/7
  });

  it("is 0 for a category without tiers yet (suspensions)", () => {
    expect(categoryDeduction(cat("SUSPENSION"), 2, 0)).toEqual({ adviser: 0, wwr: 0 });
  });
});

describe("deductionMatrixSchema", () => {
  it("accepts the SLU defaults", () => {
    expect(deductionMatrixSchema.safeParse(DEFAULT_MATRIX).success).toBe(true);
  });

  it("rejects counts that don't ascend, negative points and duplicate keys", () => {
    const demerit = cat("DEMERIT");
    const bad = (m: unknown) => deductionMatrixSchema.safeParse(m).success;
    expect(bad([{ ...demerit, tiers: [demerit.tiers[1], demerit.tiers[0]] }])).toBe(false);
    expect(bad([{ ...demerit, tiers: [{ count: 1, adviser: -1, wwr: 0 }] }])).toBe(false);
    expect(bad([demerit, demerit])).toBe(false);
  });
});
