import Link from "next/link";
import { Role, Program } from "@prisma/client";
import { z } from "zod";
import {
  AlertTriangle,
  Archive,
  Building2,
  CalendarX,
  ClipboardCheck,
  Download,
  FileClock,
  Gauge,
  GraduationCap,
  Rocket,
  TriangleAlert,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  filterRows,
  getComplianceRows,
  resolveDepartmentSemester,
  summarizeByProgram,
  type ComplianceStatus,
} from "@/lib/services/complianceService";
import { listSemesters } from "@/lib/services/semesterService";
import { getExpiringMoaRecords } from "@/lib/services/companyService";
import { ComplianceTable } from "@/components/compliance-table";
import { EmptyState } from "@/components/empty-state";
import { StatCard, StatStrip } from "@/components/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ComplianceFilters, STATUS_OPTIONS } from "./compliance-filters";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_VALUES = STATUS_OPTIONS.map((o) => o.value) as [
  ComplianceStatus,
  ...ComplianceStatus[],
];
const paramSchema = {
  semesterId: z.string().uuid(),
  program: z.nativeEnum(Program),
  status: z.enum(STATUS_VALUES),
};

// Invalid or repeated values are treated as unset; a page must never throw on a
// hand-edited URL.
function parseParam<K extends keyof typeof paramSchema>(
  searchParams: SearchParams,
  key: K
): z.infer<(typeof paramSchema)[K]> | undefined {
  const raw = searchParams[key];
  const parsed = paramSchema[key].safeParse(Array.isArray(raw) ? raw[0] : raw);
  return parsed.success ? (parsed.data as z.infer<(typeof paramSchema)[K]>) : undefined;
}

// FR-DB-04: Department Coordinator / Super Admin dashboard.
export async function CoordinatorDashboard({
  role,
  searchParams,
}: {
  role: Role;
  searchParams: SearchParams;
}) {
  const semesterId = parseParam(searchParams, "semesterId");
  const program = parseParam(searchParams, "program");
  const status = parseParam(searchParams, "status");

  // Independent fetches run together; only the rows depend on the semester.
  const [requestedSemester, semesters, expiringMoas, totalCompanies, verifiedCompanies] =
    await Promise.all([
      resolveDepartmentSemester(semesterId),
      listSemesters(),
      getExpiringMoaRecords(30),
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.company.count({ where: { deletedAt: null, isVerified: true } }),
    ]);

  // A well-formed but unknown semesterId (stale link) falls back to the active
  // semester, with a notice so the change isn't silent.
  const semesterNotFound = Boolean(semesterId) && !requestedSemester;
  const semester = semesterNotFound
    ? await resolveDepartmentSemester(undefined)
    : requestedSemester;

  const allRows = semester
    ? await getComplianceRows({
        kind: "department",
        semesterId: semester.id,
        ...(program ? { program } : {}),
      })
    : [];
  const rows = filterRows(allRows, { status });
  const programs = summarizeByProgram(allRows).sort((a, b) => a.program.localeCompare(b.program));

  const exportParams = new URLSearchParams();
  if (semesterId && !semesterNotFound) exportParams.set("semesterId", semesterId);
  if (program) exportParams.set("program", program);
  if (status) exportParams.set("status", status);
  const exportQuery = exportParams.toString();
  const exportHref = `/api/compliance/export${exportQuery ? `?${exportQuery}` : ""}`;
  // The weekly summary takes the same semester/program filters; its status
  // column already shows each report's state, so the status filter is not sent.
  const weeklyParams = new URLSearchParams();
  if (semesterId && !semesterNotFound) weeklyParams.set("semesterId", semesterId);
  if (program) weeklyParams.set("program", program);
  const weeklyQuery = weeklyParams.toString();
  const weeklySummaryHref = `/api/compliance/weekly-summary${weeklyQuery ? `?${weeklyQuery}` : ""}`;

  return (
    <div className="space-y-4">
      {expiringMoas.length > 0 && (
        <Card role="alert" className="border-notice-border bg-notice">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="flex items-center gap-2 text-sm font-medium text-notice-foreground">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {expiringMoas.length} {expiringMoas.length === 1 ? "MOA expires" : "MOAs expire"}{" "}
              within 30 days
            </p>
            <Link
              href="/companies"
              className="cursor-pointer py-1 text-sm font-medium text-notice-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              Review companies
            </Link>
          </CardContent>
        </Card>
      )}

      {semester &&
        programs.map((p) => (
          <section key={p.program} aria-label={`${p.program} summary`} className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">{p.program}</h2>
            <StatStrip>
              <StatCard label="Students" value={p.students} icon={GraduationCap} />
              <StatCard
                label="Deployed"
                value={p.deployed}
                icon={Rocket}
                hint={`of ${p.students} students`}
              />
              <StatCard
                label="Average hours"
                value={`${p.avgHoursPercent}%`}
                icon={Gauge}
                hint="of required hours"
              />
              <StatCard
                label="Needs attention"
                value={p.needsAttention}
                icon={TriangleAlert}
                action
              />
            </StatStrip>
          </section>
        ))}

      <section aria-label="Host companies" className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Host companies</h2>
        <StatStrip>
          <StatCard label="Registered" value={totalCompanies} icon={Building2} />
          <StatCard label="Verified" value={verifiedCompanies} icon={Building2} />
          <StatCard
            label="MOAs expiring"
            value={expiringMoas.length}
            icon={FileClock}
            hint="Next 30 days"
          />
        </StatStrip>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Interns</CardTitle>
              <CardDescription>
                {semester
                  ? `Hours, documents and weekly reports for ${semester.name}.`
                  : "Choose a semester to see student compliance."}
              </CardDescription>
            </div>
            {semester && (
              <div className="flex flex-wrap gap-2">
                <a
                  href={exportHref}
                  download
                  className={cn(
                    buttonVariants({ size: "sm", variant: "outline" }),
                    "cursor-pointer gap-1.5 transition-colors duration-200"
                  )}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Export to Excel
                </a>
                {/* An archived semester has no due week to report on: the sheet would be all "Not started". */}
                {!semester.archivedAt && (
                  <a
                    href={weeklySummaryHref}
                    download
                    className={cn(
                      buttonVariants({ size: "sm", variant: "outline" }),
                      "cursor-pointer gap-1.5 transition-colors duration-200"
                    )}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    Weekly summary (Excel)
                  </a>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ComplianceFilters
            semesters={semesters}
            semesterId={semesterId}
            program={program}
            status={status}
          />
          {semesterNotFound && (
            <p
              role="status"
              className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              {semester
                ? "That semester wasn't found — showing the active semester."
                : "That semester wasn't found, and no semester is active."}
            </p>
          )}
          {semester?.archivedAt && (
            <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Archive className="size-4 shrink-0" aria-hidden="true" />
              Archived semester — read-only history
            </p>
          )}
          {semester ? (
            <ComplianceTable rows={rows} showProgram />
          ) : (
            <EmptyState
              icon={CalendarX}
              title={
                role === Role.SUPER_ADMIN
                  ? "No active semester — activate one on the Semesters page"
                  : "No active semester — ask a Super Admin to activate one"
              }
              description="You can still pick an archived semester above to review its history."
              action={
                role === Role.SUPER_ADMIN ? (
                  <Link
                    href="/semesters"
                    className={cn(
                      buttonVariants({ size: "sm", variant: "outline" }),
                      "cursor-pointer gap-1.5"
                    )}
                  >
                    <ClipboardCheck className="size-4" aria-hidden="true" />
                    Go to Semesters
                  </Link>
                ) : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
