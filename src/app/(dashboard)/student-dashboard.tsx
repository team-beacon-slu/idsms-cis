import Link from "next/link";
import { ClipboardList, FileText } from "lucide-react";
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

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof FileText;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <p className="text-foreground text-sm font-medium">{title}</p>
      <p className="text-muted-foreground max-w-xs text-xs">{hint}</p>
    </div>
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
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Pre-deployment requirements</CardTitle>
          <CardDescription>
            Each document needed before you can start your internship.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requirements.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No requirements yet"
              hint="Your checklist appears here once your coordinator sets up your account."
            />
          ) : (
            <Table>
              <TableCaption className="sr-only">Pre-deployment requirement status</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((item) => (
                  <TableRow key={item.requirementType}>
                    <TableCell className="text-foreground font-medium">
                      {requirementLabel(item.requirementType)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly report history</CardTitle>
          <CardDescription>Your reports, newest week first.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No weekly reports yet"
              hint="Once you start a report it will be listed here with its status and reference code."
            />
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
                    <TableCell className="text-foreground font-medium whitespace-nowrap">
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
                        className="text-primary hover:text-primary/80 focus-visible:ring-ring inline-block cursor-pointer py-1 text-xs font-medium transition-colors duration-200 hover:underline focus-visible:ring-2 focus-visible:outline-hidden"
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
