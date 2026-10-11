import * as XLSX from "xlsx";
import { toDateKey } from "@/lib/utils/reportDeadline";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

// Header row first, then one row per item. Strings that a spreadsheet would
// evaluate as a formula (= + - @ tab CR) get a leading `'` so student-supplied
// text such as `=HYPERLINK(...)` opens as plain text. null/undefined -> "".
export function toSheetRows<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T; header: string }>
): (string | number)[][] {
  const cell = (value: unknown): string | number => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return value;
    const text = String(value);
    return FORMULA_PREFIX.test(text) ? `'${text}` : text;
  };
  return [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => cell(r[c.key])))];
}

export function buildWorkbook(
  sheets: Array<{ name: string; rows: (string | number)[][] }>
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    // Excel rejects sheet names longer than 31 characters.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name.slice(0, 31));
  }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// Filename carries the Manila calendar date: idsms-<what>-<YYYY-MM-DD>.xlsx
export function xlsxResponse(buffer: Buffer, what: string, now: Date = new Date()): Response {
  const manilaToday = new Date(now.getTime() + MANILA_OFFSET_MS);
  const filename = `idsms-${what}-${toDateKey(manilaToday)}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
