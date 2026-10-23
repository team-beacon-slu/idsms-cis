import { emailSchema, loginSchema } from "./auth";
import { bulkImportRowSchema } from "./user";

describe("emailSchema", () => {
  it("trims and lowercases what people type", () => {
    expect(emailSchema.parse("  Ana.Cruz@SLU.edu.ph ")).toBe("ana.cruz@slu.edu.ph");
  });

  it("still rejects something that isn't an email", () => {
    expect(emailSchema.safeParse("ana.cruz").success).toBe(false);
  });

  it("normalises sign-in and class-list emails the same way", () => {
    expect(loginSchema.parse({ email: "Ana@SLU.edu.ph", password: "x" }).email).toBe(
      "ana@slu.edu.ph"
    );
    expect(
      bulkImportRowSchema.parse({
        studentNumber: "2021-0001",
        email: " Ana@SLU.edu.ph",
        program: "BSIT",
        requiredHours: 486,
      }).email
    ).toBe("ana@slu.edu.ph");
  });
});
