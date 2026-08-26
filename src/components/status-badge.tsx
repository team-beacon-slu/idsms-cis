import { cn } from "@/lib/utils";

type StatusTone = "green" | "amber" | "red" | "blue" | "slate";

const TONE_CLASSES: Record<StatusTone, string> = {
  green:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20",
  amber:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
  slate:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  slate: "bg-slate-400",
};

// Every status enum across the schema (MoaStatus, ChecklistStatus, WorkPlanStatus,
// WeeklyReportStatus, ValidationStatus, DocumentStatus, NotificationStatus) funnels
// through this one map, matching the thesis wireframe's green/amber/red/blue convention.
const STATUS_TONE: Record<string, StatusTone> = {
  APPROVED: "green",
  APPROVED_ACTIVE: "green",
  VALIDATED: "green",
  GENERATED: "green",
  SENT: "green",
  REGARDED: "green",

  PENDING: "amber",
  PENDING_DRAFT: "amber",
  DRAFTING: "amber",
  SUBMITTED: "amber",
  FOR_HTE_REVIEW: "amber",
  FOR_UNIVERSITY_REVIEW: "amber",
  EXPIRING: "amber",

  RETURNED: "red",
  REJECTED: "red",
  EXPIRED: "red",
  FAILED: "red",
  DISREGARDED: "red",

  ARCHIVED: "blue",
  LOCKED: "blue",
  LINKED: "blue",
};

function humanize(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "slate";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT_CLASSES[tone])} aria-hidden="true" />
      {humanize(status)}
    </span>
  );
}
