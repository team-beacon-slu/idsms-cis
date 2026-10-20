import { findAutomaticItems, type AutomaticItemsInput } from "./automaticDeductions";
import { scheduleShift } from "./timeMath";

const shift = scheduleShift({
  startTime: "08:00",
  endTime: "17:00",
  breakMinutes: 60,
  hoursPerDay: 8,
});
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const submitted = (late: boolean, reasonForDelay: string | null = null) => ({
  type: "SUBMITTED",
  timestamp: "t",
  late,
  reasonForDelay,
});
const day = (date: string, over: Record<string, unknown> = {}) => ({
  reportDate: d(date),
  scheduledHours: 8,
  attendanceStatus: "PRESENT",
  timeIn: "08:00",
  timeOut: "12:00",
  timeIn2: "13:00",
  timeOut2: "17:00",
  ...over,
});

function input(over: Partial<AutomaticItemsInput> = {}): AutomaticItemsInput {
  return {
    now: d("2026-10-20"),
    shift,
    reports: [
      {
        id: "wr-1",
        weekStart: d("2026-10-05"),
        weekEnd: d("2026-10-11"),
        revisionHistory: [submitted(false)],
        dailyEntries: [day("2026-10-05")],
      },
    ],
    requests: [],
    ...over,
  };
}

describe("findAutomaticItems", () => {
  it("finds nothing for an on-time week of on-time days", () => {
    expect(findAutomaticItems(input())).toEqual([]);
  });

  it("flags a late weekly report by its first submission, justified when a delay reason was given", () => {
    const items = findAutomaticItems(
      input({
        reports: [
          {
            ...input().reports[0],
            revisionHistory: [submitted(true, "Typhoon"), { type: "RETURNED" }, submitted(false)],
          },
        ],
      })
    );
    expect(items).toEqual([
      expect.objectContaining({ itemType: "LATE_WWR", itemKey: "wr-1", unjustified: false }),
    ]);
  });

  it("flags a missing week between reports and a never-submitted past-due report", () => {
    const items = findAutomaticItems(
      input({
        reports: [
          input().reports[0],
          // 2026-10-12 week has no report at all
          {
            id: "wr-3",
            weekStart: d("2026-10-19"),
            weekEnd: d("2026-10-25"),
            revisionHistory: [],
            dailyEntries: [],
          },
        ],
        now: d("2026-10-28"), // week of Oct 19 is past its Tuesday deadline
      })
    );
    expect(items.map((i) => [i.itemType, i.itemKey, i.unjustified])).toEqual([
      ["MISSING_WWR", "2026-10-12", true],
      ["MISSING_WWR", "2026-10-19", true],
    ]);
  });

  it("doesn't flag a draft whose deadline hasn't passed", () => {
    const items = findAutomaticItems(
      input({
        reports: [{ ...input().reports[0], revisionHistory: [] }],
        now: d("2026-10-12"),
      })
    );
    expect(items).toEqual([]);
  });

  it("flags a late arrival with no approved undertime; unjustified only when nothing was filed", () => {
    const tardy = input({
      reports: [{ ...input().reports[0], dailyEntries: [day("2026-10-06", { timeIn: "08:30" })] }],
    });
    expect(findAutomaticItems(tardy)).toEqual([
      expect.objectContaining({
        itemType: "UNSUPPORTED_UT",
        itemKey: "2026-10-06",
        unjustified: true,
      }),
    ]);

    const pending = {
      ...tardy,
      requests: [
        {
          deviationType: "UNDERTIME",
          validationStatus: "PENDING",
          date: d("2026-10-06"),
          endDate: null,
          startTime: "08:00",
          endTime: "08:30",
        },
      ],
    };
    expect(findAutomaticItems(pending)).toEqual([
      expect.objectContaining({ itemType: "UNSUPPORTED_UT", unjustified: false }),
    ]);

    const approved = {
      ...tardy,
      requests: [{ ...pending.requests[0], validationStatus: "VALIDATED" }],
    };
    expect(findAutomaticItems(approved)).toEqual([]);
  });

  it("flags an absence not covered by an approved leave (multi-day leaves cover their range)", () => {
    const absent = input({
      reports: [
        {
          ...input().reports[0],
          dailyEntries: [
            day("2026-10-07", {
              attendanceStatus: "ABSENT",
              timeIn: null,
              timeOut: null,
              timeIn2: null,
              timeOut2: null,
            }),
          ],
        },
      ],
    });
    expect(findAutomaticItems(absent)).toEqual([
      expect.objectContaining({ itemType: "UNSUPPORTED_UT", itemKey: "2026-10-07" }),
    ]);
    const leave = {
      ...absent,
      requests: [
        {
          deviationType: "ABSENCE",
          validationStatus: "VALIDATED",
          date: d("2026-10-06"),
          endDate: d("2026-10-08"),
          startTime: null,
          endTime: null,
        },
      ],
    };
    expect(findAutomaticItems(leave)).toEqual([]);
  });

  it("ignores holidays and non-scheduled days, and schedules without shift times skip tardiness", () => {
    expect(
      findAutomaticItems(
        input({
          reports: [
            {
              ...input().reports[0],
              dailyEntries: [
                day("2026-10-08", { attendanceStatus: "HOLIDAY" }),
                day("2026-10-10", { scheduledHours: 0, timeIn: "09:00" }),
              ],
            },
          ],
        })
      )
    ).toEqual([]);
    expect(
      findAutomaticItems(
        input({
          shift: null,
          reports: [
            { ...input().reports[0], dailyEntries: [day("2026-10-06", { timeIn: "08:30" })] },
          ],
        })
      )
    ).toEqual([]);
  });
});
