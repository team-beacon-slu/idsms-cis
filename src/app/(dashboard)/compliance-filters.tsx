import { Program } from "@prisma/client";
import { Button } from "@/components/ui/button";
import type { ComplianceStatus } from "@/lib/services/complianceService";

export const STATUS_OPTIONS: Array<{ value: ComplianceStatus; label: string }> = [
  { value: "NOT_DEPLOYED", label: "Not deployed" },
  { value: "NEEDS_ATTENTION", label: "Needs attention" },
  { value: "ON_TRACK", label: "On track" },
  { value: "COMPLETED", label: "Completed" },
];

const selectClass =
  "h-9 min-w-40 cursor-pointer rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

export interface SemesterOption {
  id: string;
  name: string;
  academicYear: string;
  isActive: boolean;
  archivedAt: Date | null;
}

// A plain GET form: works with the keyboard and without JavaScript. Each select
// has a visible label; submitting reloads the dashboard with the new params.
export function ComplianceFilters({
  semesters,
  semesterId,
  program,
  status,
}: {
  semesters: SemesterOption[];
  semesterId: string | undefined;
  program: Program | undefined;
  status: ComplianceStatus | undefined;
}) {
  return (
    <form
      method="get"
      action="/"
      aria-label="Filter students"
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-semester" className="text-muted-foreground text-xs font-medium">
          Semester
        </label>
        <select
          id="filter-semester"
          name="semesterId"
          defaultValue={semesterId ?? ""}
          className={selectClass}
        >
          <option value="">Active semester</option>
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.academicYear})
              {s.archivedAt ? " - archived" : s.isActive ? " - active" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-program" className="text-muted-foreground text-xs font-medium">
          Program
        </label>
        <select
          id="filter-program"
          name="program"
          defaultValue={program ?? ""}
          className={selectClass}
        >
          <option value="">All programs</option>
          {Object.values(Program).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-status" className="text-muted-foreground text-xs font-medium">
          Status
        </label>
        <select
          id="filter-status"
          name="status"
          defaultValue={status ?? ""}
          className={selectClass}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" variant="secondary" className="cursor-pointer">
        Apply filters
      </Button>
    </form>
  );
}
