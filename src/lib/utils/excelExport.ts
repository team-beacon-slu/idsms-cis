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

const manilaStamp = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// "YYYY-MM-DD HH:mm" in Manila time (shared by every export that prints instants).
export function formatManilaDateTime(date: Date): string {
  const p = Object.fromEntries(manilaStamp.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// "YYYY-MM-DD" of the instant's Manila calendar day.
export function formatManilaDate(date: Date): string {
  return formatManilaDateTime(date).slice(0, 10);
}

// Whole Manila calendar days from `from` to `to` (negative when `to` is earlier).
export function manilaDayDiff(to: Date, from: Date): number {
  const asUtcDay = (d: Date) => Date.parse(`${formatManilaDate(d)}T00:00:00Z`);
  return Math.round((asUtcDay(to) - asUtcDay(from)) / (24 * 60 * 60 * 1000));
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
