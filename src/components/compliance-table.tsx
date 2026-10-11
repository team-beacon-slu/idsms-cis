import Link from "next/link";
import { Users } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ComplianceRow } from "@/lib/services/complianceService";

const linkClass =
  "cursor-pointer text-xs font-medium text-primary transition-colors duration-200 hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// FR-DB-03: shared per-student compliance table (faculty dashboard now;
// coordinator and admin dashboards reuse it with showProgram).
export function ComplianceTable({
  rows,
  showProgram = false,
}: {
  rows: ComplianceRow[];
  showProgram?: boolean;
}) {
  const columnCount = showProgram ? 8 : 7;

  return (
    <div
      role="region"
      aria-label="Student compliance"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Table>
        <TableCaption className="sr-only">
          Per-student hours, document, weekly report and compliance status
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            {showProgram && <TableHead>Program</TableHead>}
            <TableHead>Hours</TableHead>
            <TableHead>Docs</TableHead>
            <TableHead>Weekly report</TableHead>
            <TableHead>AI flag</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const name = row.fullName ?? row.studentNumber;
            return (
              <TableRow key={row.studentProfileId}>
                <TableCell>
                  <p className="font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.fullName ? `${row.studentNumber} · ${row.email}` : row.email}
                  </p>
                </TableCell>
                {showProgram && <TableCell>{row.program}</TableCell>}
                <TableCell>
                  <div className="min-w-32">
                    <p className="text-xs text-foreground">
                      {row.confirmedHours} / {row.requiredHours}
                    </p>
                    <div
                      role="progressbar"
                      aria-valuenow={row.hoursPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Hours progress"
                      aria-valuetext={`${row.confirmedHours} of ${row.requiredHours} hours, ${row.hoursPercent}%`}
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${row.hoursPercent}%` }}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>{row.checklistApproved}/9</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={row.dueWeekState} />
                    {row.awaitingReview > 0 && (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        {row.awaitingReview} to review
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span title="AI review not enabled" className="text-muted-foreground">
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">AI review not enabled</span>
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <Link
                      href={`/students/${row.studentProfileId}/weekly-reports`}
                      className={linkClass}
                    >
                      Reports<span className="sr-only"> for {name}</span>
                    </Link>
                    <Link
                      href={`/students/${row.studentProfileId}/checklist`}
                      className={linkClass}
                    >
                      Checklist<span className="sr-only"> for {name}</span>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-14 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Users className="size-5" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No students yet</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
