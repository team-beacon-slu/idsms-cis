import { cosine, parseGoldenCsv } from "./golden";

describe("parseGoldenCsv", () => {
  it("reads quoted fields with commas and doubled quotes", () => {
    const rows = parseGoldenCsv(
      'pairId,textA,textB,label\n1,"Built it, then tested","Said ""done""",DUPLICATE\n2,a,b,BOILERPLATE\n'
    );
    expect(rows).toEqual([
      { pairId: "1", textA: "Built it, then tested", textB: 'Said "done"', label: "DUPLICATE" },
      { pairId: "2", textA: "a", textB: "b", label: "BOILERPLATE" },
    ]);
  });

  it("rejects an unknown label with its line number", () => {
    expect(() => parseGoldenCsv("pairId,textA,textB,label\n1,a,b,MAYBE\n")).toThrow(/line 2/);
  });
});

describe("cosine", () => {
  it("is 1 for the same direction and 0 for orthogonal vectors", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
});
