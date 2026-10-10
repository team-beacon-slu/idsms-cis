/** @jest-environment node */
import { Role } from "@prisma/client";
import { GET } from "./route";
import { requireUserApi } from "@/lib/auth/session";
import { UnauthorizedError } from "@/lib/auth/errors";
import { getFacultyCalendarView, getUnifiedCalendarEvents } from "@/lib/services/calendarService";
jest.mock("@/lib/auth/session", () => ({ requireUserApi: jest.fn() }));
jest.mock("@/lib/services/calendarService", () => ({
  getFacultyCalendarView: jest.fn(),
  getUnifiedCalendarEvents: jest.fn(),
  detectHighVolumeSubmissionWeeks: jest.fn(async () => []),
  colorCodeCalendarEvents: (events: unknown) => events,
}));
jest.mock("@/lib/utils/apiError", () => ({
  handleApiError: (error: Error) =>
    new Response(JSON.stringify({ error: error.message }), {
      status: error.name === "UnauthorizedError" ? 401 : 500,
    }),
}));
beforeEach(() => {
  jest.clearAllMocks();
});
it("dispatches faculty using the session id without department aggregation", async () => {
  jest
    .mocked(requireUserApi)
    .mockResolvedValue({ id: "faculty-1", role: Role.FACULTY_ADVISER } as never);
  const events = [
    { type: "DEADLINE" as const, date: new Date("2026-10-13"), label: "Due", color: "red" },
  ];
  jest.mocked(getFacultyCalendarView).mockResolvedValue(events);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(
    expect.objectContaining({
      events: [{ ...events[0], date: events[0].date.toISOString() }],
    })
  );
  expect(getFacultyCalendarView).toHaveBeenCalledWith("faculty-1");
  expect(getUnifiedCalendarEvents).not.toHaveBeenCalled();
});
it("rejects unauthenticated calls before looking up any events", async () => {
  jest.mocked(requireUserApi).mockRejectedValue(new UnauthorizedError());
  expect((await GET()).status).toBe(401);
  expect(getFacultyCalendarView).not.toHaveBeenCalled();
  expect(getUnifiedCalendarEvents).not.toHaveBeenCalled();
});
