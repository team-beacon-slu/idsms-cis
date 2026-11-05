import { academicYearFor } from "./create-semester-form";

it("derives the academic year from the start date", () => {
  expect(academicYearFor("2026-08-10")).toBe("2026-2027");
  expect(academicYearFor("2027-01-11")).toBe("2026-2027");
  expect(academicYearFor("2027-06-01")).toBe("2027-2028");
  expect(academicYearFor("")).toBe("");
});
