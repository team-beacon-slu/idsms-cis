import { reviewChecklistItemSchema } from "@/lib/validators/checklist";

describe("reviewChecklistItemSchema", () => {
  it("rejects RETURN without a comment", () => {
    expect(reviewChecklistItemSchema.safeParse({ action: "RETURN" }).success).toBe(false);
  });

  it("rejects RETURN with a whitespace-only comment", () => {
    expect(reviewChecklistItemSchema.safeParse({ action: "RETURN", comments: "   " }).success).toBe(
      false
    );
  });

  it("rejects a comment over 500 characters", () => {
    expect(
      reviewChecklistItemSchema.safeParse({ action: "RETURN", comments: "a".repeat(501) }).success
    ).toBe(false);
  });

  it("accepts RETURN with a trimmed comment", () => {
    const result = reviewChecklistItemSchema.parse({
      action: "RETURN",
      comments: "  Re-scan it  ",
    });
    expect(result.comments).toBe("Re-scan it");
  });

  it("allows APPROVE without a comment", () => {
    expect(reviewChecklistItemSchema.safeParse({ action: "APPROVE" }).success).toBe(true);
  });
});
