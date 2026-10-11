import { safeInternalPath } from "@/lib/utils/safeInternalPath";

it("allows same-site relative paths", () => {
  expect(safeInternalPath("/students/p-1/weekly-reports")).toBe("/students/p-1/weekly-reports");
});

it.each(["//evil.example", "https://evil.example", "javascript:alert(1)", "", null, undefined, 42])(
  "rejects %p",
  (value) => {
    expect(safeInternalPath(value)).toBeNull();
  }
);
