import { programFromName } from "./class-group-forms";

it("reads the program from the start of a section name", () => {
  const programs = ["BSIT", "BSCS", "BMMA"];
  expect(programFromName("bscs 4B", programs)).toBe("BSCS");
  expect(programFromName("BMMA-3A", programs)).toBe("BMMA");
  expect(programFromName("4A BSIT", programs)).toBeUndefined();
});
