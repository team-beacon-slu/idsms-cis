import * as XLSX from "xlsx";

export interface ParsedRow {
  // 1-indexed to match what a spreadsheet user sees (header occupies row 1).
  rowNumber: number;
  data: Record<string, string>;
}

export function parseImportFile(buffer: Buffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false,
  });

  return rows.map((data, index) => ({ rowNumber: index + 2, data }));
}
