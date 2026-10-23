import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnifiedCalendarView } from "./unified-calendar-view";
import type { CalendarEvent } from "@/lib/services/calendar/calendarService";
const event = (
  date: string,
  label = "Report due",
  type: CalendarEvent["type"] = "DEADLINE"
): CalendarEvent => ({ type, date: new Date(date), label, studentProfileId: "student-1" });
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-10T12:00:00Z"));
});
afterEach(() => {
  jest.useRealTimers();
});
it("renders empty calendar, agenda, and shared month navigation", () => {
  render(<UnifiedCalendarView events={[]} />);
  expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
  expect(
    screen.getByRole("group", { name: "Month calendar" }).querySelectorAll("button")
  ).toHaveLength(42);
  expect(
    within(screen.getByRole("region", { name: "Month agenda" })).getByText("No events this month.")
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Previous month" }).closest(".hidden")).toBeNull();
});
it("filters the mobile agenda by month, navigates across years, and returns to today", () => {
  render(
    <UnifiedCalendarView
      events={[event("2026-12-31", "December report"), event("2027-01-01", "January report")]}
    />
  );
  const next = screen.getByRole("button", { name: "Next month" });
  fireEvent.click(next);
  fireEvent.click(next);
  expect(
    within(screen.getByRole("region", { name: "Month agenda" })).getByText("December report")
  ).toBeInTheDocument();
  fireEvent.click(next);
  expect(screen.getByRole("heading", { name: "January 2027" })).toBeInTheDocument();
  const agenda = within(screen.getByRole("region", { name: "Month agenda" }));
  expect(agenda.getByText("January report")).toBeInTheDocument();
  expect(agenda.queryByText("December report")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
  expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
});
it("places UTC evening events on the correct Manila date", () => {
  render(<UnifiedCalendarView events={[event("2026-10-11T16:00:00Z", "Manila Monday")]} />);
  expect(
    screen.getByRole("button", { name: "View 1 events for October 12, 2026" })
  ).toHaveTextContent("Manila Monday");
  expect(
    screen.getByRole("button", { name: "View 0 events for October 11, 2026" })
  ).toBeInTheDocument();
});
it("makes every overflow event accessible using the keyboard", async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(
    <UnifiedCalendarView
      events={Array.from({ length: 5 }, (_, i) => event("2026-10-12", `Report ${i + 1}`))}
    />
  );
  const day = screen.getByRole("button", { name: "View 5 events for October 12, 2026" });
  expect(day).toHaveTextContent("+2 more");
  day.focus();
  await user.keyboard("{Enter}");
  const details = within(screen.getByRole("region", { name: "Day details" }));
  expect(details.getAllByRole("listitem")).toHaveLength(5);
  expect(details.getByText("Report 5")).toBeInTheDocument();
  expect(day).toHaveAttribute("aria-expanded", "true");
});
it("keeps the required event colors and text labels for all four types", () => {
  render(<UnifiedCalendarView events={[]} />);
  // Dark mode mirrors these palettes in globals.css, so one class serves both themes.
  expect(screen.getByText("Submission deadline")).toHaveClass("text-red-700");
  expect(screen.getByText("Holiday")).toHaveClass("text-slate-700");
  expect(screen.getByText("Approved deviation")).toHaveClass("text-amber-700");
  expect(screen.getByText("Projected completion")).toHaveClass("text-green-700");
});
it("updates the student completion milestone and details when props change", () => {
  const { rerender } = render(
    <UnifiedCalendarView events={[event("2026-10-25", "Completion", "COMPLETION")]} />
  );
  expect(screen.getByText("Projected OJT completion date")).toBeInTheDocument();
  expect(screen.getByText("October 25, 2026")).toBeInTheDocument();
  rerender(<UnifiedCalendarView events={[event("2026-11-02", "Completion", "COMPLETION")]} />);
  expect(screen.getByText("November 2, 2026")).toBeInTheDocument();
  expect(screen.queryByText("October 25, 2026")).not.toBeInTheDocument();
});
it.each(["FACULTY_ADVISER", "DEPARTMENT_COORDINATOR", "SUPER_ADMIN"] as const)(
  "renders staff context and student report links for %s",
  (role) => {
    render(<UnifiedCalendarView role={role} events={[event("2026-10-12")]} />);
    expect(screen.getByRole("link", { name: "Student reports" })).toHaveAttribute(
      "href",
      "/students/student-1/weekly-reports"
    );
    expect(screen.queryByText("Projected OJT completion date")).not.toBeInTheDocument();
  }
);
it("clears day details when navigating and tolerates invalid date props", () => {
  render(<UnifiedCalendarView events={[event("invalid", "Invalid event")]} />);
  fireEvent.click(screen.getByRole("button", { name: "View 0 events for October 12, 2026" }));
  expect(screen.getByText("No events on this date.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  expect(screen.queryByRole("region", { name: "Day details" })).not.toBeInTheDocument();
  expect(screen.queryByText("Invalid event")).not.toBeInTheDocument();
});
