import {
  accomplishmentSimilarity,
  detectCopyPasteWarning,
  normalizeAccomplishment,
} from "./copy-paste-warning";

describe("detectCopyPasteWarning (FR-WR-04)", () => {
  const prior = "Implemented the login page and fixed validation bugs in the signup form.";

  it("flags an exact copy", () => {
    expect(detectCopyPasteWarning(prior, prior)).toBe(true);
  });

  it("flags a copy that only differs in case, punctuation, and spacing", () => {
    expect(
      detectCopyPasteWarning(
        "implemented the LOGIN page, and fixed validation bugs in the signup form",
        prior
      )
    ).toBe(true);
  });

  it("flags a near-exact copy with a small edit", () => {
    expect(
      detectCopyPasteWarning(
        "Implemented the login page and fixed validation bugs in the signin form.",
        prior
      )
    ).toBe(true);
  });

  it("does not flag genuinely different work", () => {
    expect(
      detectCopyPasteWarning(
        "Wrote unit tests for the payment service and reviewed a teammate's pull request.",
        prior
      )
    ).toBe(false);
  });

  it("never flags short entries like 'Absent' or 'Holiday'", () => {
    expect(detectCopyPasteWarning("Absent", "Absent")).toBe(false);
  });

  it("normalizes while keeping accented letters", () => {
    expect(normalizeAccomplishment("  Met with Señor  Peña!! ")).toBe("met with señor peña");
  });

  it("scores empty text as 0 similarity", () => {
    expect(accomplishmentSimilarity("", prior)).toBe(0);
  });
});
