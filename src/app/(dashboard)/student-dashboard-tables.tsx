import Link from "next/link";
import { ClipboardCheck, FileText } from "lucide-react";
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

// No shared label map exists (the checklist page just swaps "_" for " "), so
// the abbreviations that a plain title-case would mangle are spelled out here.
const REQUIREMENT_LABELS: Record<string, string> = {
  MEDICAL_CERTIFICATE: "Medical certificate",
  PSYCHOLOGICAL_CLEARANCE: "Psychological clearance",
  PARENT_CONSENT_UNDERTAKING: "Parent consent and undertaking",
  COMPANY_REPLY_FORM: "Company reply form",
  DATA_PRIVACY_ORIENTATION: "Data privacy orientation",
  INTERNSHIP_ORIENTATION: "Internship orientation",
  GOVERNMENT_COMPANY_PERMIT: "Government or company permit",
  WORK_PLAN: "Work plan",
  MOA: "Memorandum of agreement (MOA)",
};

export function requirementLabel(requirementType: string): string {
  return (
    REQUIREMENT_LABELS[requirementType] ??
    requirementType.charAt(0) + requirementType.slice(1).toLowerCase().replaceAll("_", " ")
  );
}

const linkClass =
  "inline-block cursor-pointer py-1 text-xs font-medium text-primary transition-colors duration-200 hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// FR-DB-02: per-requirement status and weekly report history for the student.
export function StudentDashboardTables({
  requirements,
  reports,
}: {
  requirements: Array<{ requirementType: string; status: string }>;
  reports: WeeklyHistoryRow[];
}) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Pre-deployment requirements</CardTitle>
          <CardDescription>
            Each document needs approval before you can be deployed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requirements.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No requirements yet"
              hint="They appear here once your internship profile is set up."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableCaption className="sr-only">
                  Status of each pre-deployment requirement
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requirements.map((item) => (
                    <TableRow key={item.requirementType}>
                      <TableCell className="font-medium text-foreground">
                        {requirementLabel(item.requirementType)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly report history</CardTitle>
          <CardDescription>Newest week first.</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No weekly reports yet"
              hint="Start your first report from Weekly reports and it will be listed here."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableCaption className="sr-only">
                  Weekly reports with status and reference code
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="whitespace-nowrap">{report.week}</TableCell>
                      <TableCell>
                        <StatusBadge status={report.state} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {report.referenceCode ?? (
                          <span className="text-muted-foreground">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">Not submitted yet</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href="/weekly-reports" className={linkClass}>
                          Open<span className="sr-only"> report for {report.week}</span>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
