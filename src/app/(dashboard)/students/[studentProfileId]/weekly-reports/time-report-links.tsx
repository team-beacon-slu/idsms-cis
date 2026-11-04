import { FileDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TimeReportKind } from "@/lib/documents/timeReportTemplate";

const LINKS: Record<TimeReportKind, { slug: string; label: string }> = {
  OT: { slug: "overtime", label: "Overtime report" },
  UT: { slug: "undertime", label: "Under time report" },
  ABSENCE: { slug: "absences", label: "Absence report" },
};

// SLU's OT, UT and absence reports as separate PDFs, rendered on request. With
// `weeklyReportId` they cover that week (attach to its WWR); without, the whole internship.
export function TimeReportLinks({
  studentProfileId,
  kinds,
  weeklyReportId,
}: {
  studentProfileId: string;
  kinds: TimeReportKind[];
  weeklyReportId?: string;
}) {
  return kinds.map((kind) => (
    <a
      key={kind}
      href={`/api/students/${studentProfileId}/time-reports/${LINKS[kind].slug}${weeklyReportId ? `?week=${weeklyReportId}` : ""}`}
      download
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer gap-1.5")}
    >
      <FileDown className="size-3.5" aria-hidden="true" />
      {LINKS[kind].label}
    </a>
  ));
}
