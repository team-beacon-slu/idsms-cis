/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
const accomplishmentsBox = (id: string) => document.getElementById(`acc-${id}`);

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

it("changes only the day whose times were edited, never the rest of the week", () => {
  const usualTimes = { timeIn: "08:00", timeOut: "19:00", timeIn2: "", timeOut2: "" };
  render(<WeeklyReportForm {...props} entries={week} editable usualTimes={usualTimes} />);

  fireEvent.change(timeOut("tue"), { target: { value: "17:00" } }); // left early on Tuesday only

  expect(timeOut("tue")).toHaveValue("17:00");
  expect(timeOut("wed")).toHaveValue("19:00");
  expect(timeOut("thu")).toHaveValue("19:00");
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

it("marks every day that needs fixing on Submit and scrolls to the first", async () => {
  const scroll = jest.fn();
  Element.prototype.scrollIntoView = scroll;
  render(<WeeklyReportForm {...props} entries={week} editable />);

  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));

  // One error summary with a link per day, each field flagged and tied to its message.
  const summary = screen.getByRole("alert");
  expect(summary.querySelectorAll("a")).toHaveLength(3);
  expect(summary).toHaveTextContent("Wed, Oct 21: Enter your time in and time out");
  const timeInWed = document.getElementById("in-wed");
  expect(timeInWed).toHaveAttribute("aria-invalid", "true");
  expect(timeInWed).toHaveAttribute("aria-describedby", "problem-wed");
  expect(document.getElementById("problem-wed")).toHaveTextContent(
    "Enter your time in and time out"
  );
  // Every day with a problem is opened so its message sits next to the field.
  expect(document.getElementById("day-thu")).toHaveAttribute("open");
  expect(toast.error).toHaveBeenCalledWith("3 days need fixing; each is marked below");
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(document.activeElement).toBe(document.getElementById("in-tue")));
});

it("clears a day's error once the intern edits it", () => {
  Element.prototype.scrollIntoView = jest.fn();
  render(<WeeklyReportForm {...props} entries={week} editable />);
  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));

  fireEvent.change(timeIn("tue"), { target: { value: "08:00" } });

  expect(screen.getByRole("alert").querySelectorAll("a")).toHaveLength(2);
  expect(timeIn("tue")).not.toHaveAttribute("aria-invalid");
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

const shift = { startMin: 8 * 60, endMin: 17 * 60, breakMinutes: 60, scheduledHours: 8 };
const reasonBox = (id: string) => document.getElementById(`reason-${id}`) as HTMLTextAreaElement;

it("starts every scheduled day at the schedule's times and opens only the first day to fill", () => {
  render(<WeeklyReportForm {...props} entries={week} editable shift={shift} />);

  expect(timeIn("thu")).toHaveValue("08:00");
  expect(timeOut("thu")).toHaveValue("17:00");
  expect(document.getElementById("day-tue")).toHaveAttribute("open");
  expect(document.getElementById("day-wed")).not.toHaveAttribute("open");
});

it("asks for a reason only when the times differ from the schedule", () => {
  render(<WeeklyReportForm {...props} entries={week} editable shift={shift} />);
  expect(reasonBox("tue")).toBeNull();

  fireEvent.change(timeOut("tue"), { target: { value: "19:00" } });

  expect(screen.getByText(/Overtime 5:00 pm – 7:00 pm \(2 hrs\)/)).toBeInTheDocument();
  expect(reasonBox("tue")).not.toBeNull();
  expect(reasonBox("wed")).toBeNull();
});

it("won't submit an early leave without a reason, and says so on that day", () => {
  Element.prototype.scrollIntoView = jest.fn();
  const work = {
    tue: "Set up the login page and its validation rules",
    wed: "Met the client about invoice exports and wrote notes",
    thu: "Fixed three bugs found by QA in the payroll screen",
  };
  const written = week.map((d) => ({
    ...d,
    attendanceStatus: "PRESENT",
    actualHours: 8,
    timeIn: "08:00",
    timeOut: "17:00",
    accomplishments: work[d.id as keyof typeof work],
  }));
  render(<WeeklyReportForm {...props} entries={written} editable shift={shift} />);
  fireEvent.change(timeOut("wed"), { target: { value: "15:00" } });

  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Wed, Oct 21: Say why you left early (at least 10 characters)"
  );
  expect(reasonBox("wed")).toHaveAttribute("aria-invalid", "true");
});

it("an absent day asks why and for the proof, with no times or accomplishments", () => {
  Element.prototype.scrollIntoView = jest.fn();
  render(<WeeklyReportForm {...props} entries={[entry]} editable shift={shift} />);

  fireEvent.click(screen.getByRole("radio", { name: "Absent" }));

  expect(timeIn("e-1")).toBeNull();
  expect(accomplishmentsBox("e-1")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));
  expect(screen.getByRole("alert")).toHaveTextContent("Say why you were absent");

  fireEvent.change(reasonBox("e-1"), { target: { value: "Fever, saw a doctor" } });
  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));
  expect(screen.getByRole("alert")).toHaveTextContent("Choose the proof you'll upload");
});

it("shows the reasons an intern gave when the week is read-only", () => {
  const submitted = {
    ...entry,
    attendanceStatus: "ABSENT",
    actualHours: 0,
  };
  render(
    <WeeklyReportForm
      {...props}
      entries={[submitted]}
      editable={false}
      notes={{ "2026-10-19": { reason: "Fever, saw a doctor", proofType: "MEDICAL_CERTIFICATE" } }}
    />
  );
  expect(screen.getAllByText(/Fever, saw a doctor/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/proof: Medical certificate/).length).toBeGreaterThan(0);
});

it("lists Monday to Friday for a Mon–Thu schedule: Friday is a day off that can be added", () => {
  const monThu = ["19", "20", "21", "22"].map((d) => day(`d${d}`, `2026-10-${d}T00:00:00.000Z`));
  render(
    <WeeklyReportForm {...props} weekEnd="2026-10-25T00:00:00.000Z" entries={monThu} editable />
  );
  expect(screen.getByText(/Fri, Oct 23/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "I worked on Fri, Oct 23" })).toBeInTheDocument();
  expect(screen.queryByText(/Sat, Oct 24/)).toBeNull();
  expect(screen.getByRole("list", { name: /This week/ }).children).toHaveLength(5);
});
