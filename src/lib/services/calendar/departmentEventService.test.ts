jest.mock("@/lib/services/accounts/auditService", () => ({ logEvent: jest.fn() }));

import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { logEvent } from "@/lib/services/accounts/auditService";
import { CalendarEntryError } from "@/lib/services/calendar/companyDaysService";
import {
  addDepartmentEvent,
  removeDepartmentEvent,
} from "@/lib/services/calendar/departmentEventService";

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(logEvent).mockClear();
});

it("adds an event to the active semester at Manila midnight and logs it", async () => {
  prismaMock.semester.findFirst.mockResolvedValue({ id: "sem-1" } as never);
  prismaMock.departmentEvent.create.mockResolvedValue({ id: "ev-1" } as never);

  const created = await addDepartmentEvent(
    { date: "2026-11-20", name: "  Pre-deployment orientation " },
    "coord-1"
  );

  expect(created).toEqual({ id: "ev-1" });
  expect(prismaMock.departmentEvent.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        semesterId: "sem-1",
        date: new Date("2026-11-20T00:00:00.000Z"),
        title: "Pre-deployment orientation",
        createdById: "coord-1",
      },
    })
  );
  expect(jest.mocked(logEvent).mock.calls[0][0]).toEqual(
    expect.objectContaining({ action: "DEPARTMENT_EVENT_ADDED", entityId: "ev-1" })
  );
});

it("refuses an event when no semester is active, so it would show nowhere", async () => {
  prismaMock.semester.findFirst.mockResolvedValue(null);

  await expect(
    addDepartmentEvent({ date: "2026-11-20", name: "Seminar" }, "coord-1")
  ).rejects.toBeInstanceOf(CalendarEntryError);
  expect(prismaMock.departmentEvent.create).not.toHaveBeenCalled();
});

it("rejects a blank name or a non-date before touching the database", async () => {
  await expect(addDepartmentEvent({ date: "2026-11-20", name: "  " }, "c")).rejects.toThrow();
  await expect(addDepartmentEvent({ date: "20 Nov", name: "Seminar" }, "c")).rejects.toThrow();
  expect(prismaMock.semester.findFirst).not.toHaveBeenCalled();
});

it("removes an event and logs its title", async () => {
  prismaMock.departmentEvent.findUnique.mockResolvedValue({
    id: "ev-1",
    title: "Seminar",
  } as never);

  await removeDepartmentEvent("ev-1", "coord-1");

  expect(prismaMock.departmentEvent.delete).toHaveBeenCalledWith({ where: { id: "ev-1" } });
  expect(jest.mocked(logEvent).mock.calls[0][0]).toEqual(
    expect.objectContaining({ action: "DEPARTMENT_EVENT_REMOVED", detail: { title: "Seminar" } })
  );
});

it("says so when the event was already removed", async () => {
  prismaMock.departmentEvent.findUnique.mockResolvedValue(null);

  await expect(removeDepartmentEvent("ev-9", "coord-1")).rejects.toBeInstanceOf(CalendarEntryError);
  expect(prismaMock.departmentEvent.delete).not.toHaveBeenCalled();
});
