/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  usePathname: () => "/students/sp-1/weekly-reports/wr-1",
}));
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

const day = (id: string, date: string): DailyEntryRow => ({ ...entry, id, reportDate: date });
const week = [
  day("tue", "2026-10-20T00:00:00.000Z"),
  day("wed", "2026-10-21T00:00:00.000Z"),
  day("thu", "2026-10-22T00:00:00.000Z"),
];
const timeIn = (id: string) => document.getElementById(`in-${id}`) as HTMLInputElement;
const timeOut = (id: string) => document.getElementById(`out-${id}`) as HTMLInputElement;

it("prefills new days with the intern's usual times when the schedule has none", () => {
  const usualTimes = { timeIn: "08:30", timeOut: "17:30", timeIn2: "", timeOut2: "" };
  render(<WeeklyReportForm {...props} entries={week} editable usualTimes={usualTimes} />);

  expect(timeIn("wed")).toHaveValue("08:30");
  expect(timeOut("thu")).toHaveValue("17:30");
});

it("prefills new days with the last worked day's tools", () => {
  render(<WeeklyReportForm {...props} entries={week} editable usualTools="VS Code, Figma" />);

  expect(document.getElementById("tools-wed")).toHaveValue("VS Code, Figma");
});

it("copies times typed on one day to the later untouched days, but not to edited ones", () => {
  render(<WeeklyReportForm {...props} entries={week} editable />);
  fireEvent.change(timeIn("thu"), { target: { value: "10:00" } }); // Thursday is edited

  fireEvent.change(timeIn("tue"), { target: { value: "09:00" } });
  fireEvent.change(timeOut("tue"), { target: { value: "17:00" } });
  fireEvent.change(timeIn("tue"), { target: { value: "09:30" } }); // hour, then minutes

  expect(timeIn("wed")).toHaveValue("09:30");
  expect(timeOut("wed")).toHaveValue("17:00");
  expect(timeIn("thu")).toHaveValue("10:00");
});

const tools = (id: string) => document.getElementById(`tools-${id}`) as HTMLInputElement;

it("carries Tools used to the later blank days once typed, leaving filled ones alone", () => {
  render(<WeeklyReportForm {...props} entries={week} editable />);
  fireEvent.change(tools("thu"), { target: { value: "Excel" } });
  fireEvent.change(tools("tue"), { target: { value: "VS Code, Figma" } });
  fireEvent.blur(tools("tue"));

  expect(tools("wed")).toHaveValue("VS Code, Figma");
  expect(tools("thu")).toHaveValue("Excel");
});

it("marks every day that needs fixing on Submit and scrolls to the first", () => {
  const scroll = jest.fn();
  Element.prototype.scrollIntoView = scroll;
  render(<WeeklyReportForm {...props} entries={week} editable />);

  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));

  // One error summary with a link per day, each field flagged and tied to its message.
  const summary = screen.getByRole("alert");
  expect(summary.querySelectorAll("a")).toHaveLength(3);
  expect(summary).toHaveTextContent("Wed, Oct 21: Enter hours worked");
  const acc = document.getElementById("hours-wed");
  expect(acc).toHaveAttribute("aria-invalid", "true");
  expect(acc).toHaveAttribute("aria-describedby", "problem-wed");
  expect(document.getElementById("problem-wed")).toHaveTextContent("Enter hours worked");
  expect(toast.error).toHaveBeenCalledWith("3 days need fixing; each is marked below");
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(document.getElementById("hours-tue"));
});

it("clears a day's error once the intern edits it", () => {
  Element.prototype.scrollIntoView = jest.fn();
  render(<WeeklyReportForm {...props} entries={week} editable />);
  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));

  fireEvent.change(document.getElementById("hours-tue")!, { target: { value: "8" } });

  expect(screen.getByRole("alert").querySelectorAll("a")).toHaveLength(2);
  expect(document.getElementById("hours-tue")).not.toHaveAttribute("aria-invalid");
});

it("flags a missing reason for delay on a late report next to the box", () => {
  Element.prototype.scrollIntoView = jest.fn();
  const filled = {
    ...entry,
    attendanceStatus: "PRESENT",
    actualHours: 8,
    accomplishments: "Did it",
  };
  render(
    <WeeklyReportForm {...props} weekEnd="2026-10-25T00:00:00.000Z" entries={[filled]} editable />
  );
  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));

  const box = document.getElementById("delay-wr-1");
  expect(box).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Reason for delay is required");
});
