/** @jest-environment node */
import { Role } from "@prisma/client";
import { GET } from "./route";
import { requireUserApi } from "@/lib/auth/session";
import { detectHighVolumeSubmissionWeeks } from "@/lib/services/calendarService";
jest.mock("@/lib/auth/session", () => ({ requireUserApi: jest.fn() }));
jest.mock("@/lib/services/calendarService", () => ({
  getUnifiedCalendarEvents: jest.fn(async () => []),
  getFacultyCalendarView: jest.fn(async () => []),
  getCoordinatorCalendarView: jest.fn(async () => []),
  detectEndorsementLetterSpikes: jest.fn(async () => []),
  detectHighVolumeSubmissionWeeks: jest.fn(),
  colorCodeCalendarEvents: (events: unknown) => events,
}));
jest.mock("@/lib/utils/apiError", () => ({
  handleApiError: () => new Response(null, { status: 500 }),
}));
beforeEach(() => {
  jest.clearAllMocks();
});
it("exposes faculty volume highlights with the authenticated faculty id", async () => {
  jest
    .mocked(requireUserApi)
    .mockResolvedValue({ id: "faculty-1", role: Role.FACULTY_ADVISER } as never);
  const highVolumeWeeks = [{ weekStart: new Date("2026-10-04T16:00:00Z"), count: 21 }];
  jest.mocked(detectHighVolumeSubmissionWeeks).mockResolvedValue(highVolumeWeeks);
  expect(await (await GET()).json()).toEqual(
    expect.objectContaining({
      highVolumeWeeks: [{ weekStart: highVolumeWeeks[0].weekStart.toISOString(), count: 21 }],
    })
  );
  expect(detectHighVolumeSubmissionWeeks).toHaveBeenCalledWith("faculty-1", expect.any(Array));
});
it.each([Role.STUDENT_INTERN, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN])(
  "does not calculate faculty volumes for %s",
  async (role) => {
    jest.mocked(requireUserApi).mockResolvedValue({ id: "user-1", role } as never);
    expect((await GET()).status).toBe(200);
    expect(detectHighVolumeSubmissionWeeks).not.toHaveBeenCalled();
  }
);
