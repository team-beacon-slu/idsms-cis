/** @jest-environment node */
import * as XLSX from "xlsx";
import { buildWorkbook, toSheetRows, xlsxResponse } from "@/lib/utils/excelExport";

describe("toSheetRows", () => {
  const columns = [
    { key: "name" as const, header: "Name" },
    { key: "hours" as const, header: "Hours" },
  ];

  it("puts the header row first and keeps numbers numeric", () => {
    expect(toSheetRows([{ name: "Ana", hours: 12.5 }], columns)).toEqual([
      ["Name", "Hours"],
      ["Ana", 12.5],
    ]);
  });

  it("neutralises formula-injection prefixes", () => {
    const rows = toSheetRows(
      [
        { name: '=HYPERLINK("x")', hours: 1 },
        { name: "+1", hours: 1 },
        { name: "-1", hours: 1 },
        { name: "@SUM(A1)", hours: 1 },
        { name: "\tx", hours: 1 },
        { name: "\rx", hours: 1 },
      ],
      columns
    );
    expect(rows.slice(1).map((r) => r[0])).toEqual([
      '\'=HYPERLINK("x")',
      "'+1",
      "'-1",
      "'@SUM(A1)",
      "'\tx",
      "'\rx",
    ]);
  });

  it("turns null and undefined into empty strings", () => {
    expect(toSheetRows([{ name: null, hours: undefined }], columns)[1]).toEqual(["", ""]);
  });
});

describe("buildWorkbook", () => {
  it("round-trips sheet name and header row", () => {
    const buf = buildWorkbook([
      {
        name: "Compliance",
        rows: [
          ["Name", "Hours"],
          ["Ana", 3],
        ],
      },
    ]);
    const wb = XLSX.read(buf);
    expect(wb.SheetNames).toEqual(["Compliance"]);
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Compliance, { header: 1 });
    expect(data[0]).toEqual(["Name", "Hours"]);
    expect(data[1]).toEqual(["Ana", 3]);
  });

  it("truncates sheet names to Excel's 31-character limit", () => {
    const buf = buildWorkbook([{ name: "x".repeat(40), rows: [["a"]] }]);
    expect(XLSX.read(buf).SheetNames[0]).toHaveLength(31);
  });
});

describe("xlsxResponse", () => {
  it("sets download headers and a Manila-dated filename", async () => {
    const res = xlsxResponse(Buffer.from("x"), "compliance", new Date("2026-10-11T17:00:00Z"));
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="idsms-compliance-2026-10-12.xlsx"'
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
