import { feedToken, toIcs, verifyFeedToken } from "./icsFeed";

describe("ics feed", () => {
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  it("verifies only its own user's token", () => {
    const t = feedToken("user-1");
    expect(verifyFeedToken("user-1", t)).toBe(true);
    expect(verifyFeedToken("user-2", t)).toBe(false);
    expect(verifyFeedToken("user-1", "x")).toBe(false);
  });

  it("writes all-day Manila-date events, escaped and de-duplicated", () => {
    const ics = toIcs(
      [
        {
          type: "DEADLINE",
          date: new Date("2026-11-10T00:00:00Z"),
          label: "Weekly report, week of Nov 2",
        },
        {
          type: "DEADLINE",
          date: new Date("2026-11-10T00:00:00Z"),
          label: "Weekly report, week of Nov 2",
        },
        { type: "EVENT", date: new Date("2026-11-19T16:30:00Z"), label: "Orientation; bring ID" },
      ],
      new Date("2026-11-07T00:00:00Z")
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261110");
    expect(ics).toContain("DTEND;VALUE=DATE:20261111");
    // 16:30 UTC on the 19th is the 20th in Manila.
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120");
    expect(ics).toContain("SUMMARY:Event: Orientation\\; bring ID");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});
