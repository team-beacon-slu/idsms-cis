import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { addSuspensionDay, removeSuspensionDay, SuspensionError } from "./suspensionService";

describe("suspension days", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.semester.findFirst.mockResolvedValue({ id: "sem-1" } as never);
  });

  it("adds a semester-wide SUSPENSION day with an audit entry", async () => {
    prismaMock.holidayCalendarEntry.findFirst.mockResolvedValue(null);
    prismaMock.holidayCalendarEntry.create.mockResolvedValue({ id: "h1" } as never);
    await expect(
      addSuspensionDay({ date: "2026-11-10", name: " Typhoon " }, "coord")
    ).resolves.toEqual({
      id: "h1",
    });
    expect(prismaMock.holidayCalendarEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          holidayType: "SUSPENSION",
          semesterId: "sem-1",
          name: "Typhoon",
          date: new Date("2026-11-10T00:00:00.000Z"),
        }),
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("refuses a date that is already a day off", async () => {
    prismaMock.holidayCalendarEntry.findFirst.mockResolvedValue({
      name: "All Souls' Day",
    } as never);
    await expect(addSuspensionDay({ date: "2026-11-02", name: "Rain" }, "coord")).rejects.toThrow(
      SuspensionError
    );
  });

  it("removes the day and the interns' opt-out markers for it", async () => {
    const date = new Date("2026-11-10T00:00:00.000Z");
    prismaMock.holidayCalendarEntry.findFirst.mockResolvedValue({
      id: "h1",
      date,
      name: "Typhoon",
      semesterId: "sem-1",
    } as never);
    await removeSuspensionDay("h1", "coord");
    expect(prismaMock.holidayCalendarEntry.deleteMany).toHaveBeenCalledWith({
      where: { date, holidayType: "SUSPENSION", studentProfile: { semesterId: "sem-1" } },
    });
    expect(prismaMock.holidayCalendarEntry.delete).toHaveBeenCalledWith({ where: { id: "h1" } });
  });
});
