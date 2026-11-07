import type { Program } from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import { PROGRAM_NAME, tasksOutsideProgram } from "@/lib/utils/workPlanFit";

type Task = { area?: string | null; description: string; output?: string | null };

// FR-WP-03: names the tasks that don't sound like the intern's program. Advice only;
// the coordinator still approves or returns the plan.
export function ProgramFitNote({
  program,
  tasks,
  forReviewer = false,
}: {
  program: Program;
  tasks: Task[];
  forReviewer?: boolean;
}) {
  const outside = tasksOutsideProgram(program, tasks);
  if (outside.length === 0) return null;
  const listed = outside.map((i) => `#${i + 1}`).join(", ");
  return (
    <div
      role="status"
      className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">
          {outside.length === 1 ? "Task" : "Tasks"} {listed} may not fit {PROGRAM_NAME[program]} (
          {program}).
        </p>
        <p>
          {forReviewer
            ? "No program-related words were found in them. Check them before approving, or return the plan asking for details."
            : "Describe how each one uses your program's skills (tools, systems, outputs). If your company uses its own work plan format, upload it above and add the missing details here."}
        </p>
      </div>
    </div>
  );
}
