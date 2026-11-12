import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toDateKey } from "@/lib/utils/reportDeadline";
import { reportPeriodEnd } from "@/lib/utils/reportWeek";
import { formatCalendarDate } from "@/lib/documents/html";
import { GenerateWeekButton } from "./generate-week-button";

// One folding section of the intern's weekly reports (To do, Missing, Submitted), Google
// Classroom style: the header always shows how many and what kind, so a folded section still
// says what is inside.
export function WeekSection({
  title,
  count,
  hint,
  tone,
  open,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  tone?: "alert";
  open: boolean;
  children: React.ReactNode;
}) {
  const alert = tone === "alert" && count > 0;
  return (
    <details
      open={open}
      className={cn(
        "group/section rounded-xl border bg-card",
        alert && "border-danger-soft-foreground/40"
      )}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-foreground">{title}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              alert
                ? "bg-danger-soft text-danger-soft-foreground"
                : count > 0
                  ? "bg-primary/10 text-foreground"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {count}
          </span>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/section:rotate-180"
          aria-hidden="true"
        />
      </summary>
      {count > 0 && <div className="space-y-4 border-t px-4 pt-4 pb-4">{children}</div>}
    </details>
  );
}

// A week since the first report that has no report yet: nothing exists until the intern
// starts it here (the page never creates weeks on its own).
export function NotStartedWeek({
  studentProfileId,
  weekStart,
  weekNo,
  late,
}: {
  studentProfileId: string;
  weekStart: Date;
  weekNo: number;
  late: boolean;
}) {
  const end = reportPeriodEnd(weekStart, []); // what a started week with no days shows
  return (
    <div
      id={`week-${toDateKey(weekStart)}`}
      className="flex scroll-mt-6 flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4"
    >
      <div>
        <p className="text-sm font-medium text-foreground">
          Week No. {weekNo}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {formatCalendarDate(weekStart)} – {formatCalendarDate(end)}
          </span>
        </p>
        <p
          className={cn("text-xs", late ? "text-danger-soft-foreground" : "text-muted-foreground")}
        >
          WWR{String(weekNo).padStart(2, "0")} ·{" "}
          {late ? "Missing: not started, past its Tuesday" : "Not started yet"}
        </p>
      </div>
      <GenerateWeekButton studentProfileId={studentProfileId} weekStart={toDateKey(weekStart)} />
    </div>
  );
}
