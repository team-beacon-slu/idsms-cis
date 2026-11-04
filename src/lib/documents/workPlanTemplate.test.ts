import { renderWorkPlanHtml } from "@/lib/documents/workPlanTemplate";
import { asWorkPlanRows, submitWorkPlanSchema } from "@/lib/validators/workPlan";

const data = {
  student: { name: "Dela Cruz, Juan P." },
  company: { name: "Acme <Corp>", supervisorName: "Maria Santos" },
  rows: [
    {
      period: "June 10 – June 11, 2026",
      area: "Pre-Data Gathering Phase",
      description: "Collection of data in a form of interview\nIdentifying problems/issues",
      output: "Draft Copy of the Collected Data",
      hours: 14,
    },
    { description: "Assist in preparation", hours: 2 },
  ],
  status: "SUBMITTED",
  generatedAt: new Date("2026-06-09T02:00:00Z"),
};

it("prints SAMCIS's sample columns, one line per task, and the total without overtime", () => {
  const html = renderWorkPlanHtml(data);
  for (const head of [
    "Period",
    "Area/Topic",
    "Specific Tasks",
    "Expected Output",
    "No. of hours spent",
  ]) {
    expect(html).toContain(`<th>${head}</th>`);
  }
  expect(html.match(/<div class="task">/g)).toHaveLength(3);
  expect(html).toContain("Total Hours (Overtime not included)");
  expect(html).toContain("16 Hours");
  expect(html).toContain("Acme &lt;Corp&gt;");
});

it("keeps the trainee and supervisor certification at the end of the OJT", () => {
  const html = renderWorkPlanHtml(data);
  expect(html).toContain(
    "the trainee and supervisor must sign below to certify the training is completed"
  );
  expect(html).toContain("understands the trainee's performance level");
  expect(html.match(/Supervisor Signature:/g)).toHaveLength(2);
});

it("accepts an old plain task list and the new rows", () => {
  expect(
    submitWorkPlanSchema.safeParse({ plannedTasks: [{ description: "Build X" }] }).success
  ).toBe(true);
  expect(submitWorkPlanSchema.safeParse({ plannedTasks: data.rows }).success).toBe(true);
  expect(submitWorkPlanSchema.safeParse({ plannedTasks: [{ description: " " }] }).success).toBe(
    false
  );
  expect(asWorkPlanRows("not a list")).toEqual([]);
});
