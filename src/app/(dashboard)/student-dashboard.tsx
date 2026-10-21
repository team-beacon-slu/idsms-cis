import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WeeklyHistoryRow } from "@/lib/services/complianceService";

const REQUIREMENT_LABELS: Record<string, string> = {
  MEDICAL_CERTIFICATE: "Medical certificate",
  PSYCHOLOGICAL_CLEARANCE: "Psychological clearance",
  PARENT_CONSENT_UNDERTAKING: "Parent consent and undertaking",
  COMPANY_REPLY_FORM: "Company reply form",
  DATA_PRIVACY_ORIENTATION: "Data privacy orientation",
  INTERNSHIP_ORIENTATION: "Internship orientation",
  GOVERNMENT_COMPANY_PERMIT: "Government or company permit",
  WORK_PLAN: "Work plan",
  MOA: "Memorandum of Agreement (MOA)",
};

export function requirementLabel(type: string): string {
  return REQUIREMENT_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
}

// An empty block keeps its frame and says one thing.
function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

// FR-DB-02: per-requirement checklist status and weekly report history.
export function StudentDashboardTables({
  requirements,
  history,
}: {
  requirements: Array<{ requirementType: string; status: string }>;
  history: WeeklyHistoryRow[];
}) {
  // All nine requirements always show, so the list agrees with the "0/9" count even
  // before the coordinator has created any checklist rows.
  const byType = new Map(requirements.map((r) => [r.requirementType, r.status]));
  const rows = Object.keys(REQUIREMENT_LABELS).map((type) => ({
    requirementType: type,
    status: byType.get(type) ?? "NOT_STARTED",
  }));
  return (
    // Stacked, not side by side: nine requirements against a short history left the
    // shorter card ending far above its neighbour. History first: it changes weekly.
    <div className="flex flex-col gap-4">
      <Card className="order-2">
        <CardHeader>
          <CardTitle>Pre-deployment requirements</CardTitle>
          <CardDescription>
            Submitted in Google Classroom; tracked here once reviewed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul
            aria-label="Pre-deployment requirement status"
            className="grid grid-cols-1 gap-x-8 sm:grid-cols-2"
          >
            {rows.map((item) => (
              <li
                key={item.requirementType}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-border/70 text-sm"
              >
                <span className="font-medium text-foreground">
                  {requirementLabel(item.requirementType)}
                </span>
                <StatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="order-1">
        <CardHeader>
          <CardTitle>Weekly report history</CardTitle>
          <CardDescription>Your reports, newest week first.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyLine>No weekly reports yet. Start this week from Weekly reports.</EmptyLine>
          ) : (
            <Table>
              <TableCaption className="sr-only">Weekly report history</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium whitespace-nowrap text-foreground">
                      {row.week}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.state} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.referenceCode ?? "Not submitted"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href="/weekly-reports"
                        className="inline-block cursor-pointer py-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                      >
                        View<span className="sr-only"> report for {row.week}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
