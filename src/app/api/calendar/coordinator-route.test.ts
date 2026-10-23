/** @jest-environment node */
import { Role } from "@prisma/client";
import { GET } from "./route";
import { requireUserApi } from "@/lib/auth/session";
import {
  getCoordinatorCalendarView,
  detectEndorsementLetterSpikes,
} from "@/lib/services/calendar/calendarService";
jest.mock("@/lib/auth/session", () => ({ requireUserApi: jest.fn() }));
jest.mock("@/lib/services/calendar/calendarService", () => ({
  getUnifiedCalendarEvents: jest.fn(async () => []),
  getFacultyCalendarView: jest.fn(async () => []),
  getCoordinatorCalendarView: jest.fn(async () => []),
  detectEndorsementLetterSpikes: jest.fn(async () => []),
  detectHighVolumeSubmissionWeeks: jest.fn(async () => []),
  colorCodeCalendarEvents: (events: unknown) => events,
}));
jest.mock("@/lib/utils/apiError", () => ({
  handleApiError: () => new Response(null, { status: 500 }),
}));
beforeEach(() => {
  jest.clearAllMocks();
});
it.each([Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN])(
  "wires the department calendar and completion spikes for %s",
  async (role) => {
    jest.mocked(requireUserApi).mockResolvedValue({ id: "viewer-1", role } as never);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ events: [], endorsementSpikes: [] })
    );
    expect(getCoordinatorCalendarView).toHaveBeenCalledWith("viewer-1");
    expect(detectEndorsementLetterSpikes).toHaveBeenCalledWith("viewer-1", expect.any(Array));
  }
);
it.each([Role.STUDENT_INTERN, Role.FACULTY_ADVISER])(
  "keeps department-only data out of %s calendars",
  async (role) => {
    jest.mocked(requireUserApi).mockResolvedValue({ id: "viewer-1", role } as never);
    expect((await GET()).status).toBe(200);
    expect(getCoordinatorCalendarView).not.toHaveBeenCalled();
    expect(detectEndorsementLetterSpikes).not.toHaveBeenCalled();
  }
);
