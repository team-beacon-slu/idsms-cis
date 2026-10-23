import { scrubPii } from "@/lib/ai/scrubPii";

it("removes emails, student numbers, phone numbers, URLs, and given names", () => {
  const out = scrubPii(
    "Juan Dela Cruz (2026-00123-MN-0, juan@slu.edu.ph, 0917 123 4567) fixed https://acme.ph/x",
    { names: ["Juan Dela Cruz"] }
  );
  expect(out).not.toMatch(/Juan|2026-00123|@slu|0917|acme\.ph/);
  expect(out).toContain("[NAME]");
  expect(out).toContain("[EMAIL]");
  expect(out).toContain("[ID]");
  expect(out).toContain("[PHONE]");
  expect(out).toContain("[URL]");
});

it("leaves ordinary work text intact", () => {
  expect(scrubPii("Built the login page and wrote 12 unit tests")).toBe(
    "Built the login page and wrote 12 unit tests"
  );
});
