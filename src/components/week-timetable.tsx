import Link from "next/link";
import { cn } from "@/lib/utils";

// A week drawn as seven day cells (Mon to Sun), so a schedule or a week's report reads at a
// glance instead of as a sentence ("Mon, Tue, Wed, Thu · 10 hrs/day"). Used for the work
// schedule (Attendance, weekly reports) and for a week's progress inside its report.

export type TimetableTone =
  | "work" // a scheduled working day
  | "off" // not in the schedule
  | "holiday"
  | "todo" // scheduled, not written yet
  | "done" // written (present)
  | "absent"
  | "flag" // needs fixing or a reason
  | "extra"; // a day off that was worked (overtime)

export interface TimetableCell {
  key: string;
  weekday: string; // "Mon"
  date?: string; // "10"
  tone: TimetableTone;
  label: string; // "Work", "Day off", "Absent"…
  shortLabel?: string; // one word for a phone-width cell, e.g. "Fill"
  short?: string; // phone detail, e.g. "8a–5p"
  detail?: string; // wider screens, e.g. "8:00 am – 5:00 pm"
  href?: string; // jump to that day
  onSelect?: () => void; // client pages: open that day in place
  description?: string; // full sentence for screen readers
}

const TONE: Record<TimetableTone, string> = {
  work: "border-primary/40 bg-primary/10 text-foreground",
  off: "border-dashed bg-muted/30 text-muted-foreground",
  holiday:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100",
  todo: "border-primary/50 bg-background text-foreground",
  done: "border-status-done/50 bg-status-done/15 text-foreground",
  absent: "border-danger-soft-foreground/30 bg-danger-soft text-danger-soft-foreground",
  flag: "border-notice-border bg-notice text-notice-foreground",
  extra: "border-status-on/40 bg-status-on/10 text-foreground",
};

const INTERACTIVE =
  "transition-[box-shadow] duration-150 hover:ring-1 hover:ring-ring/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const DOT: Record<TimetableTone, string> = {
  work: "bg-primary",
  off: "bg-muted-foreground/40",
  holiday: "bg-sky-500",
  todo: "bg-primary/40",
  done: "bg-status-done",
  absent: "bg-status-alert",
  flag: "bg-amber-500",
  extra: "bg-status-on",
};

export function WeekTimetable({
  cells,
  label,
  legend,
}: {
  cells: TimetableCell[];
  label: string; // names the list for screen readers
  legend?: TimetableTone[];
}) {
  return (
    <div className="space-y-2">
      <ol aria-label={label} className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((c) => {
          const body = (
            <>
              {c.description && <span className="sr-only">{c.description}</span>}
              <span aria-hidden={c.description ? true : undefined} className="contents">
                <span className="block text-[11px] font-semibold tracking-wide uppercase sm:text-xs">
                  {c.weekday}
                  {c.date && <span className="ml-1 font-normal opacity-70">{c.date}</span>}
                </span>
                <span
                  aria-hidden="true"
                  className={cn("mx-auto my-1.5 block h-1.5 w-6 rounded-full", DOT[c.tone])}
                />
                <span className="block text-[11px] leading-tight font-medium sm:text-sm">
                  <span className="sm:hidden">{c.shortLabel ?? c.label}</span>
                  <span className="hidden sm:inline">{c.label}</span>
                </span>
                {(c.short || c.detail) && (
                  <span className="mt-0.5 block text-[10px] leading-tight opacity-80 sm:text-xs">
                    <span className="sm:hidden">{c.short ?? c.detail}</span>
                    <span className="hidden sm:inline">{c.detail ?? c.short}</span>
                  </span>
                )}
              </span>
            </>
          );
          const box = cn(
            "block h-full min-h-20 rounded-md border px-0.5 py-2 text-center sm:px-2",
            TONE[c.tone]
          );
          return (
            <li key={c.key} className="min-w-0">
              {c.onSelect ? (
                <button
                  type="button"
                  onClick={c.onSelect}
                  className={cn(box, "w-full cursor-pointer", INTERACTIVE)}
                >
                  {body}
                </button>
              ) : c.href ? (
                <Link href={c.href} className={cn(box, INTERACTIVE)}>
                  {body}
                </Link>
              ) : (
                <div className={box}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      {legend && legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {legend.map((tone) => (
            <li key={tone} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("h-1.5 w-4 rounded-full", DOT[tone])} />
              {LEGEND_TEXT[tone]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const LEGEND_TEXT: Record<TimetableTone, string> = {
  work: "Work day",
  off: "Day off",
  holiday: "Holiday",
  todo: "To fill in",
  done: "Ready",
  absent: "Absent",
  flag: "Needs attention",
  extra: "Overtime day",
};
