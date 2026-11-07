import { tasksOutsideProgram } from "./workPlanFit";

const task = (description: string, area = "") => ({ area, description });

it("flags only the tasks that don't sound like the program's work", () => {
  const tasks = [
    task("Build the inventory web app"),
    task("Serve coffee to guests"),
    task("Fix printer drivers", "IT support"),
  ];
  expect(tasksOutsideProgram("BSIT", tasks)).toEqual([1]);
});

it("matches at word starts only", () => {
  // "happy" contains "app", "artisan" starts with "art" (a BMMA word).
  expect(tasksOutsideProgram("BSIT", [task("Keep the clients happy")])).toEqual([0]);
  expect(tasksOutsideProgram("BMMA", [task("Shoot product photos")])).toEqual([]);
});

it("uses the program's own words", () => {
  const tasks = [task("Edit the promotional video")];
  expect(tasksOutsideProgram("BMMA", tasks)).toEqual([]);
  expect(tasksOutsideProgram("BSCS", tasks)).toEqual([0]);
});

it("ignores blank rows and reads the area and expected output too", () => {
  expect(
    tasksOutsideProgram("BSCS", [
      task(""),
      { description: "Weekly tasks", area: "", output: "A working database" },
    ])
  ).toEqual([]);
});
