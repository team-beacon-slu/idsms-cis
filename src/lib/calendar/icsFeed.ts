// Calendar feed (.ics) for phone calendars: deadlines, holidays, company days off and
// department events as all-day entries. Phone calendar apps fetch the feed without a session,
// so its link carries a per-user signature instead (HMAC of the user id).
// shortcut: no per-user revocation; a deactivated account's feed stops, and rotating
// NEXTAUTH_SECRET resets every link. Upgrade to a stored, resettable token if links leak.
import { createHmac, timingSafeEqual } from "node:crypto";

export function feedToken(userId: string): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET!)
    .update(`ics:${userId}`)
    .digest("base64url");
}

export function verifyFeedToken(userId: string, token: string): boolean {
  const expected = Buffer.from(feedToken(userId));
  const got = Buffer.from(token);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export interface FeedEvent {
  type: string;
  date: Date;
  label: string;
}

const LABEL: Record<string, string> = {
  DEADLINE: "Due",
  HOLIDAY: "Day off",
  DEVIATION: "Approved request",
  COMPLETION: "Projected OJT completion",
  EVENT: "Event",
};

// Manila calendar day, as the in-app calendar shows it.
const manilaDay = (d: Date) =>
  new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10).replaceAll("-", "");

const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545: lines longer than 75 octets continue on the next line after a space.
function fold(line: string): string {
  const out: string[] = [];
  for (let rest = line; rest.length > 0; rest = rest.slice(73)) out.push(rest.slice(0, 73));
  return out.join("\r\n ");
}

export function toIcs(events: FeedEvent[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const seen = new Set<string>();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Team BEACON//IDSMS//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:IDSMS",
    "X-WR-TIMEZONE:Asia/Manila",
  ];
  for (const e of events) {
    const day = manilaDay(e.date);
    const summary = `${LABEL[e.type] ?? e.type}: ${e.label}`;
    const uid = `${day}-${createHmac("sha1", "uid").update(summary).digest("hex").slice(0, 16)}@idsms`;
    if (seen.has(uid)) continue; // staff calendars repeat shared milestones
    seen.add(uid);
    const next = new Date(e.date.getTime() + 8 * 3_600_000 + 86_400_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replaceAll("-", "")}`,
      fold(`SUMMARY:${escapeText(summary)}`),
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
