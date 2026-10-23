import { firstName, greeting } from "./greeting";

describe("greeting", () => {
  it("uses the Manila clock", () => {
    // 01:00 UTC is 09:00 in Manila
    expect(greeting(null, new Date("2026-10-23T01:00:00Z"))).toBe("Good morning");
    expect(greeting(null, new Date("2026-10-23T06:00:00Z"))).toBe("Good afternoon");
    expect(greeting(null, new Date("2026-10-23T12:00:00Z"))).toBe("Good evening");
  });

  it("greets by first name", () => {
    expect(greeting("Danielle Aragon", new Date("2026-10-23T12:00:00Z"))).toBe(
      "Good evening, Danielle"
    );
  });
});

describe("firstName", () => {
  it.each([
    ["Aragon, Danielle John P.", "Danielle"],
    ["Danielle Aragon", "Danielle"],
    ["  ", null],
    [null, null],
    ["Aragon,", null],
  ])("%p -> %p", (input, expected) => {
    expect(firstName(input)).toBe(expected);
  });
});
