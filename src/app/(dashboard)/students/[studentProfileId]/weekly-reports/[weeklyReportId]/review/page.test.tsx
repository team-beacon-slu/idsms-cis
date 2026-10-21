/** @jest-environment node */
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("REDIRECT");
  }),
  notFound: jest.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
jest.mock("@/lib/auth/session", () => ({ requireUserPage: jest.fn() }));
jest.mock("@/lib/services/userService", () => ({
  ...jest.requireActual("@/lib/services/userService"),
  assertCanAccessStudent: jest.fn(),
}));
jest.mock("@/lib/services/weeklyReportService", () => ({
  ...jest.requireActual("@/lib/services/weeklyReportService"),
  getWeeklyReport: jest.fn(),
}));
jest.mock("@/lib/ai/settings", () => ({ getAiSettings: jest.fn() }));

import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getWeeklyReport } from "@/lib/services/weeklyReportService";
import WeeklyReportReviewPage from "./page";

beforeEach(() => {
  jest.clearAllMocks();
  (requireUserPage as jest.Mock).mockResolvedValue({ id: "f-1", role: "FACULTY_ADVISER" });
});

it("refuses another student's report opened under this student's URL", async () => {
  (getWeeklyReport as jest.Mock).mockResolvedValue({
    id: "wr-other",
    studentProfileId: "student-from-another-class",
  });

  await expect(
    WeeklyReportReviewPage({
      params: Promise.resolve({ studentProfileId: "my-student", weeklyReportId: "wr-other" }),
    })
  ).rejects.toThrow("NOT_FOUND");
  expect(notFound).toHaveBeenCalled();
});
