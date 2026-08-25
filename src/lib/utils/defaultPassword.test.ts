import { generateDefaultPassword } from "./defaultPassword";

const AMBIGUOUS_CHARS = /[0O1IL]/;

describe("generateDefaultPassword", () => {
  const originalPepper = process.env.STUDENT_DEFAULT_PASSWORD_PEPPER;

  beforeEach(() => {
    process.env.STUDENT_DEFAULT_PASSWORD_PEPPER = "test-pepper-value";
  });

  afterAll(() => {
    process.env.STUDENT_DEFAULT_PASSWORD_PEPPER = originalPepper;
  });

  it("is deterministic for the same student number", () => {
    const first = generateDefaultPassword("2021-00001");
    const second = generateDefaultPassword("2021-00001");
    expect(first).toBe(second);
  });

  it("produces a different password for a different student number", () => {
    const a = generateDefaultPassword("2021-00001");
    const b = generateDefaultPassword("2021-00002");
    expect(a).not.toBe(b);
  });

  it("produces a different password when the pepper changes", () => {
    const first = generateDefaultPassword("2021-00001");
    process.env.STUDENT_DEFAULT_PASSWORD_PEPPER = "a-different-pepper";
    const second = generateDefaultPassword("2021-00001");
    expect(first).not.toBe(second);
  });

  it("never includes ambiguous characters (0/O/1/I/L)", () => {
    for (const studentNumber of ["2021-00001", "2022-99999", "abc", "0000000001"]) {
      const password = generateDefaultPassword(studentNumber);
      expect(password).not.toMatch(AMBIGUOUS_CHARS);
    }
  });

  it("produces a 10-character password", () => {
    expect(generateDefaultPassword("2021-00001")).toHaveLength(10);
  });

  it("throws when the pepper env var is not set", () => {
    delete process.env.STUDENT_DEFAULT_PASSWORD_PEPPER;
    expect(() => generateDefaultPassword("2021-00001")).toThrow(
      "STUDENT_DEFAULT_PASSWORD_PEPPER is not set"
    );
  });
});
