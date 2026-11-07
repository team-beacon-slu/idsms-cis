/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { StudentDashboardTables } from "./student-dashboard";

const req = (requirementType: string, status: string, required = true) => ({
  requirementType,
  status,
  required,
});

it("lists only what still needs doing, with a bar for the approved share", () => {
  render(
    <StudentDashboardTables
      history={[]}
      requirements={[
        req("MEDICAL_CERTIFICATE", "APPROVED"),
        req("PSYCHOLOGICAL_CLEARANCE", "RETURNED"),
        req("WORK_PLAN", "PENDING"),
      ]}
    />
  );

  const todo = screen.getByRole("list", { name: "Still to do" });
  expect(todo.querySelectorAll("li")).toHaveLength(2);
  expect(todo).toHaveTextContent("Returned");
  expect(todo).not.toHaveTextContent("Approved");
  const bar = screen.getByRole("progressbar", { name: "Required items approved" });
  expect(bar).toHaveAttribute("aria-valuenow", "1");
  expect(bar).toHaveAttribute("aria-valuemax", "3");
});

it("on phones shows three chips and links the rest to the checklist", () => {
  const types = ["A", "B", "C", "D", "E"].map((t) => req(`TYPE_${t}`, "PENDING"));
  render(<StudentDashboardTables history={[]} requirements={types} />);

  const chips = screen.getByRole("list", { name: "Still to do" }).querySelectorAll("li");
  expect([...chips].filter((li) => li.className.includes("max-sm:hidden"))).toHaveLength(2);
  expect(screen.getByRole("link", { name: "+2 more in your checklist" })).toHaveAttribute(
    "href",
    "/checklist"
  );
});

it("says so in one line once every required item is approved", () => {
  render(
    <StudentDashboardTables
      history={[]}
      requirements={[req("MEDICAL_CERTIFICATE", "APPROVED"), req("WORK_PLAN", "APPROVED")]}
    />
  );

  expect(screen.getByText("All required items approved.")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Still to do" })).toBeNull();
});
