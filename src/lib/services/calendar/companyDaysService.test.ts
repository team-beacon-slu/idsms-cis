import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { addCompanyDay, CalendarEntryError, removeCompanyDay } from "./companyDaysService";

const companyId = "4f0b7c1e-6a2d-4c55-9a3e-0d1f2b3c4d5e";

describe("company days off (coordinator)", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.company.findFirst.mockResolvedValue({ name: "Acme PH" } as never);
  });

  it("adds a day off for one company only, with its reason", async () => {
    prismaMock.holidayCalendarEntry.findFirst.mockResolvedValue(null);
    prismaMock.holidayCalendarEntry.create.mockResolvedValue({ id: "h1" } as never);
    await expect(
      addCompanyDay({ companyId, date: "2026-11-10", name: " Company anniversary " }, "coord")
    ).resolves.toEqual({ id: "h1" });
    const data = prismaMock.holidayCalendarEntry.create.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        holidayType: "COMPANY",
        companyId,
        name: "Company anniversary",
        date: new Date("2026-11-10T00:00:00.000Z"),
      })
    );
    expect(data).not.toHaveProperty("semesterId");
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("requires a reason and refuses a date the company already has off", async () => {
    await expect(
      addCompanyDay({ companyId, date: "2026-11-10", name: " " }, "coord")
    ).rejects.toThrow();
    prismaMock.holidayCalendarEntry.findFirst.mockResolvedValue({ name: "Founders' Day" } as never);
    await expect(
      addCompanyDay({ companyId, date: "2026-11-10", name: "Rain" }, "coord")
    ).rejects.toThrow(CalendarEntryError);
  });

  it("removes the day and the opt-outs of interns at that company", async () => {
    const date = new Date("2026-11-10T00:00:00.000Z");
    prismaMock.holidayCalendarEntry.findFirst.mockResolvedValue({
      id: "h1",
      date,
      name: "Company anniversary",
      companyId,
    } as never);
    await removeCompanyDay("h1", "coord");
    expect(prismaMock.holidayCalendarEntry.deleteMany).toHaveBeenCalledWith({
      where: { date, holidayType: "COMPANY", studentProfile: { companyId } },
    });
    expect(prismaMock.holidayCalendarEntry.delete).toHaveBeenCalledWith({ where: { id: "h1" } });
  });
});
