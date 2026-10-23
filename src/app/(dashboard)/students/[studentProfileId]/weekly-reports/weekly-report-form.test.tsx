/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { toast } from "sonner";
import { WeeklyReportForm, type DailyEntryRow } from "./weekly-report-form";

const entry: DailyEntryRow = {
  id: "e-1",
  reportDate: "2026-10-19T00:00:00.000Z",
  scheduledHours: 8,
  actualHours: null,
  accomplishments: null,
  toolsUsed: null,
  attendanceStatus: "SCHEDULED",
  timeIn: null,
  timeOut: null,
  timeIn2: null,
  timeOut2: null,
};
const props = {
  weeklyReportId: "wr-1",
  totals: { totalHours: 0, runningTotal: 0, conductDeductions: 0, remainingHours: 240 },
  weekEnd: "2099-10-25T00:00:00.000Z",
  priorAccomplishments: [],
};
const accomplishments = () => screen.getByPlaceholderText("What did you work on and finish today?");

beforeEach(() => {
  localStorage.clear();
  jest.mocked(toast.info).mockClear();
});

it("brings back what the student typed after the tab was closed", async () => {
  const first = render(<WeeklyReportForm {...props} entries={[entry]} editable />);
  fireEvent.change(accomplishments(), { target: { value: "Built the login page" } });
  first.unmount(); // tab closed without saving

  render(<WeeklyReportForm {...props} entries={[entry]} editable />);

  expect(accomplishments()).toHaveValue("Built the login page");
  expect(toast.info).toHaveBeenCalledTimes(1);
});

it("keeps the server's version when the day was saved elsewhere since", async () => {
  const first = render(<WeeklyReportForm {...props} entries={[entry]} editable />);
  fireEvent.change(accomplishments(), { target: { value: "Draft text" } });
  first.unmount();

  const savedOnPhone = { ...entry, attendanceStatus: "PRESENT", accomplishments: "Phone text" };
  render(<WeeklyReportForm {...props} entries={[savedOnPhone]} editable />);

  expect(accomplishments()).toHaveValue("Phone text");
  expect(toast.info).not.toHaveBeenCalled();
});

it("drops the draft once the report is no longer editable", async () => {
  const first = render(<WeeklyReportForm {...props} entries={[entry]} editable />);
  fireEvent.change(accomplishments(), { target: { value: "Draft text" } });
  first.unmount();

  render(<WeeklyReportForm {...props} entries={[entry]} editable={false} />);

  expect(localStorage.getItem("idsms:weekly-draft:wr-1")).toBeNull();
});
