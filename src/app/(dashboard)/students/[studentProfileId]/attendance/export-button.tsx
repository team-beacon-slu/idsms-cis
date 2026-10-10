"use client";

import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// FR-AT-07 — Owner: AndresBonifaci0 (Matt)
// Requirement: students can export their attendance log as CSV.
// Connects to: GET /api/students/[studentProfileId]/attendance-export
// (Task 11 route) → `attendanceService.exportAttendanceLogCsv` (Task 3).
// The route already sets `Content-Disposition: attachment` — this button
// just needs to trigger the browser download (`window.open` or an anchor
// click, not `fetch` + manual blob handling, unless auth requires it).
// Edge cases: none.
// Implementation: a plain anchor — the session cookie rides along with the
// navigation, and the attachment header keeps the user on this page.
export function AttendanceExportButton({ studentProfileId }: { studentProfileId: string }) {
  return (
    <a
      href={`/api/students/${studentProfileId}/attendance-export`}
      download
      data-testid="attendance-export-button"
      className={cn(
        buttonVariants({ size: "sm", variant: "outline" }),
        "cursor-pointer gap-1.5 transition-colors duration-200"
      )}
    >
      <Download className="size-4" aria-hidden="true" />
      Export CSV
    </a>
  );
}
