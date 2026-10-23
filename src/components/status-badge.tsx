import { cn } from "@/lib/utils";

type StatusTone = "green" | "amber" | "red" | "blue" | "slate";

const TONE_CLASSES: Record<StatusTone, string> = {
  green: "bg-mint-50 text-mint-900 border-mint-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  // The brand navy's tints: submitted and in progress, on its way to a decision.
  blue: "bg-brand-50 text-brand-900 border-brand-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  green: "bg-beacon",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-brand-600",
  slate: "bg-slate-400",
};

// Every status enum across the schema (MoaStatus, ChecklistStatus, WorkPlanStatus,
// WeeklyReportStatus, ValidationStatus, DocumentStatus, NotificationStatus) funnels
// through this one map, matching the thesis wireframe's green/amber/red/blue convention.
const STATUS_TONE: Record<string, StatusTone> = {
  APPROVED: "green",
  APPROVED_ACTIVE: "green",
  ACTIVE: "green",
  VALIDATED: "green",
  GENERATED: "green",
  SENT: "green",
  REGARDED: "green",
  COMPLETED: "green",
  ON_TRACK: "blue",

  PENDING: "blue",
  SUBMITTED: "blue",
  FOR_HTE_REVIEW: "blue",
  FOR_UNIVERSITY_REVIEW: "blue",
  PENDING_DRAFT: "slate",
  DRAFTING: "slate",
  DRAFT: "slate",
  EXPIRING: "amber",

  RETURNED: "red",
  REJECTED: "red",
  EXPIRED: "red",
  FAILED: "red",
  DISREGARDED: "red",
  NEEDS_ATTENTION: "red",

  ARCHIVED: "slate",
  LOCKED: "slate",
  LINKED: "blue",
};

// Sentence case: "NOT_STARTED" reads "Not started".
function humanize(status: string) {
  const words = status.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "slate";

  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT_CLASSES[tone])} aria-hidden="true" />
      {humanize(status)}
    </span>
  );
}
