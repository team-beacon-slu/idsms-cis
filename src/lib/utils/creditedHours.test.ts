import { Prisma } from "@prisma/client";
import { entryCreditedHours, sumCreditedHours } from "./creditedHours";

describe("entryCreditedHours", () => {
  it("uses the stored credited hours when present", () => {
    expect(
      entryCreditedHours({
        creditedHours: new Prisma.Decimal(7.5),
        actualHours: 9,
        scheduledHours: 8,
      })
    ).toBe(7.5);
  });

  it("caps legacy rows at their scheduled hours", () => {
    expect(entryCreditedHours({ creditedHours: null, actualHours: 9, scheduledHours: 8 })).toBe(8);
    expect(entryCreditedHours({ actualHours: 6, scheduledHours: 8 })).toBe(6);
  });

  it("counts ABSENT and HOLIDAY as 0", () => {
    expect(
      entryCreditedHours({ actualHours: 8, scheduledHours: 8, attendanceStatus: "ABSENT" })
    ).toBe(0);
    expect(
      entryCreditedHours({ actualHours: 8, scheduledHours: 8, attendanceStatus: "HOLIDAY" })
    ).toBe(0);
  });

  it("handles mocks with only actualHours, and nulls, without NaN", () => {
    expect(entryCreditedHours({ actualHours: 8 })).toBe(8);
    expect(entryCreditedHours({ actualHours: null })).toBe(0);
    expect(entryCreditedHours({})).toBe(0);
  });
});

describe("sumCreditedHours", () => {
  it("sums and rounds to 2 decimals", () => {
    expect(
      sumCreditedHours([{ actualHours: 9, scheduledHours: 8 }, { creditedHours: 7.333 }])
    ).toBe(15.33);
  });
});
