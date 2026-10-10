// Shared helpers for Module 8 document templates. Templates are pure
// functions returning a full HTML document string, so the same markup feeds
// both the in-app preview (<iframe srcDoc>) and Puppeteer's page.pdf().

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Every value interpolated into a template goes through this — report text
// is student-authored and must never become markup.
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// weekStart/weekEnd/reportDate are calendar dates stored as UTC midnight —
// format in UTC so the server's timezone can't shift them a day.
export function formatCalendarDate(date: Date, opts: { weekday?: boolean } = {}): string {
  return date.toLocaleDateString("en-PH", {
    ...(opts.weekday ? { weekday: "short" as const } : {}),
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Real instants (submission time, generation time) are shown in Manila time.
export function formatInstant(date: Date): string {
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export const PRINT_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11pt; margin: 0; }
  header { text-align: center; border-bottom: 1px solid #999; padding-bottom: 8px; }
  .eyebrow { font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #555; margin: 0; }
  h1 { font-size: 16pt; margin: 4px 0; }
  .period { margin: 0; }
  .watermark { color: #b45309; font-weight: bold; letter-spacing: 3px; }
  dl.meta { display: grid; grid-template-columns: 9rem 1fr 9rem 1fr; gap: 2px 12px; margin: 12px 0; font-size: 10pt; }
  dl.meta dt { color: #555; }
  dl.meta dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10pt; }
  th, td { border-bottom: 1px solid #ccc; padding: 6px 4px; text-align: left; vertical-align: top; }
  tr { break-inside: avoid; }
  td.text { white-space: pre-wrap; }
  .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; text-align: center; }
  .totals div { border: 1px solid #999; border-radius: 4px; padding: 6px; }
  .totals dt { color: #555; font-size: 9pt; }
  .totals dd { margin: 0; font-weight: bold; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 56px; text-align: center; font-size: 9pt; }
  .signatures div { border-top: 1px solid #333; padding-top: 4px; }
  footer { margin-top: 24px; text-align: center; font-size: 8pt; color: #666; }
`;
