import { displayName, displayNameFromEmail, initials } from "./displayName";

describe("displayNameFromEmail", () => {
  it.each([
    ["juan.delacruz@slu.edu.ph", "Delacruz, Juan"],
    ["maria.clara.santos@slu.edu.ph", "Santos, Maria Clara"],
    ["JUAN_DELA-CRUZ2@x.com", "Cruz, Juan Dela"],
    ["2201234@slu.edu.ph", "2201234"],
    ["solo@x.com", "Solo"],
  ])("%s → %s", (email, name) => {
    expect(displayNameFromEmail(email)).toBe(name);
  });
});

describe("displayName", () => {
  it("prefers a student's legal name, then the display name, then the email", () => {
    expect(displayName({ email: "a@x.ph", fullName: "Prof. Cruz", studentName: "Ana Cruz" })).toBe(
      "Ana Cruz"
    );
    expect(displayName({ email: "a@x.ph", fullName: "Prof. Cruz" })).toBe("Prof. Cruz");
    expect(displayName({ email: "a@x.ph", fullName: "  " })).toBe("a@x.ph");
  });

  it("falls back to the student number before the email, and never shows blank", () => {
    expect(displayName({ fullName: "", studentNumber: "2231", email: "a@x.ph" })).toBe("2231");
    expect(displayName({ fullName: null, studentNumber: null })).toBe("An intern");
  });
});

describe("initials", () => {
  it.each([
    ["Ana M. Cruz", "AC"],
    ["Ana", "AN"],
    ["faculty.test@idsms.local", "FA"],
    ["", "?"],
  ])("%p -> %p", (input, expected) => {
    expect(initials(input)).toBe(expected);
  });
});
