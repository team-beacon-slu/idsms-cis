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
const accomplishments = () =>
  screen.getByPlaceholderText("List the work you accomplished this day");
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

it("changes only the day whose times were edited, never the rest of the week", () => {
  const usualTimes = { timeIn: "08:00", timeOut: "19:00", timeIn2: "", timeOut2: "" };
  render(<WeeklyReportForm {...props} entries={week} editable usualTimes={usualTimes} />);

  fireEvent.change(timeOut("tue"), { target: { value: "17:00" } }); // left early on Tuesday only

  expect(timeOut("tue")).toHaveValue("17:00");
  expect(timeOut("wed")).toHaveValue("19:00");
  expect(timeOut("thu")).toHaveValue("19:00");
});

it("marks every day that needs fixing on Submit and scrolls to the first", async () => {
  const scroll = jest.fn();
  Element.prototype.scrollIntoView = scroll;
  render(<WeeklyReportForm {...props} entries={week} editable />);

  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));

  // One error summary with a link per day, each field flagged and tied to its message.
  const summary = screen.getByRole("alert");
  expect(summary.querySelectorAll("a")).toHaveLength(3);
  expect(summary).toHaveTextContent("Wed, Oct 21: Enter your Time In and Time Out");
  const timeInWed = document.getElementById("in-wed");
  expect(timeInWed).toHaveAttribute("aria-invalid", "true");
  expect(timeInWed).toHaveAttribute("aria-describedby", "problem-wed");
  expect(document.getElementById("problem-wed")).toHaveTextContent(
    "Enter your Time In and Time Out"
  );
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

const timeIn2 = (id: string) => document.getElementById(`in2-${id}`) as HTMLInputElement;
const timeOut2 = (id: string) => document.getElementById(`out2-${id}`) as HTMLInputElement;

it("starts every scheduled day at the schedule's times, as the template's AM and PM rows", () => {
  render(<WeeklyReportForm {...props} entries={week} editable shift={shift} />);

  expect(timeIn("thu")).toHaveValue("08:00");
  expect(timeOut("thu")).toHaveValue("12:00");
  expect(timeIn2("thu")).toHaveValue("13:00"); // after the 1-hour break
  expect(timeOut2("thu")).toHaveValue("17:00");
  expect(screen.getAllByLabelText("PM Time Out")).toHaveLength(3);
  expect(screen.getAllByText("8 hrs")).toHaveLength(3); // Hours Rendered, break left out
});

it("uses the report template's labels", () => {
  render(<WeeklyReportForm {...props} entries={week} editable shift={shift} />);

  for (const label of [
    "Date (Day)",
    "Actual Work Times",
    "Hours Rendered",
    "List of Work Accomplished",
  ]) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  expect(screen.getByText("Total work-hours rendered")).toBeInTheDocument();
  expect(screen.getByText("TOTAL rendered so far (ending)")).toBeInTheDocument();
  expect(screen.queryByText(/Tools used/)).toBeNull();
});

it("shows an afternoon-only day in the PM row and still counts it", () => {
  const afternoon = {
    ...entry,
    attendanceStatus: "PRESENT",
    scheduledHours: 4, // a half-day schedule, so 4 hours is the full day
    actualHours: 4,
    timeIn: "13:00",
    timeOut: "17:00",
    accomplishments: "Wrote the user guide for the payroll module",
  };
  render(<WeeklyReportForm {...props} entries={[afternoon]} editable />);

  expect(timeIn("e-1")).toHaveValue("");
  expect(timeIn2("e-1")).toHaveValue("13:00");
  expect(timeOut2("e-1")).toHaveValue("17:00");
  expect(screen.getByText("4 hrs")).toBeInTheDocument(); // Hours Rendered
  expect(document.getElementById("reason-e-1")).toBeNull(); // a full day: no remarks asked
});

it("won't take a row with only one of its two times", () => {
  Element.prototype.scrollIntoView = jest.fn();
  render(<WeeklyReportForm {...props} entries={[entry]} editable shift={shift} />);
  fireEvent.change(timeOut2("e-1"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: /Submit and generate PDF/ }));

  expect(screen.getByRole("alert")).toHaveTextContent("Enter both the PM Time In and Time Out");
  expect(timeOut2("e-1")).toHaveAttribute("aria-invalid", "true");
});

it("lets the intern set a first day of OJT in Week No. 1 only: earlier days are not absences", () => {
  const { unmount } = render(<WeeklyReportForm {...props} entries={week} editable />);
  expect(screen.queryByLabelText("First day of OJT")).toBeNull();
  unmount();

  // Started on Tuesday Oct 20: Monday has no entry and is not a day off either.
  render(
    <WeeklyReportForm
      {...props}
      weekEnd="2026-10-25T00:00:00.000Z"
      entries={week}
      editable
      firstWeek
      firstDay="2026-10-20T00:00:00.000Z"
    />
  );
  expect(screen.getByLabelText("First day of OJT")).toHaveValue("2026-10-20");
  expect(screen.getByText(/OJT not yet started/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "I worked on Mon, Oct 19" })).toBeNull();
});

it("asks for a reason only when the times differ from the schedule", () => {
  render(<WeeklyReportForm {...props} entries={week} editable shift={shift} />);
  expect(reasonBox("tue")).toBeNull();

  fireEvent.change(timeOut2("tue"), { target: { value: "19:00" } });

  expect(screen.getByText("Report on Overtime Hours")).toBeInTheDocument();
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
  expect(screen.getByText("Oct 23 (Friday)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "I worked on Fri, Oct 23" })).toBeInTheDocument();
  expect(screen.queryByText(/Oct 24/)).toBeNull(); // Saturday: only when worked
  expect(screen.getAllByRole("region")).toHaveLength(4); // one section per reported day
});
