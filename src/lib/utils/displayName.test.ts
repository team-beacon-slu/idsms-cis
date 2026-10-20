import { displayNameFromEmail } from "./displayName";

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
