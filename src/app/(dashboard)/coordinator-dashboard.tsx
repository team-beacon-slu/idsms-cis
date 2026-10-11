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
  Users,
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
import { StatCard } from "@/components/stat-card";
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
  const [
    requestedSemester,
    semesters,
    expiringMoas,
    totalUsers,
    totalCompanies,
    verifiedCompanies,
  ] = await Promise.all([
    resolveDepartmentSemester(semesterId),
    listSemesters(),
    getExpiringMoaRecords(30),
    prisma.user.count({ where: { deletedAt: null } }),
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

  return (
    <div className="space-y-4">
      {expiringMoas.length > 0 && (
        <Card
          role="alert"
          className="border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/10"
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {expiringMoas.length} {expiringMoas.length === 1 ? "MOA expires" : "MOAs expire"}{" "}
              within 30 days
            </p>
            <Link
              href="/companies"
              className="cursor-pointer py-1 text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-200"
            >
              Review companies
            </Link>
          </CardContent>
        </Card>
      )}

      {semester &&
        programs.map((p) => (
          <section key={p.program} aria-label={`${p.program} summary`} className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{p.program}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Students" value={p.students} icon={GraduationCap} tone="blue" />
              <StatCard
                label="Deployed"
                value={p.deployed}
                icon={Rocket}
                tone="green"
                hint={`of ${p.students} students`}
              />
              <StatCard
                label="Avg hours"
                value={`${p.avgHoursPercent}%`}
                icon={Gauge}
                tone="slate"
                hint="of required hours"
              />
              <StatCard
                label="Needs attention"
                value={p.needsAttention}
                icon={TriangleAlert}
                tone={p.needsAttention > 0 ? "amber" : "slate"}
              />
            </div>
          </section>
        ))}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={totalUsers} icon={Users} tone="blue" />
        <StatCard
          label="Registered companies"
          value={totalCompanies}
          icon={Building2}
          tone="slate"
        />
        <StatCard
          label="Verified companies"
          value={verifiedCompanies}
          icon={Building2}
          tone="green"
        />
        <StatCard
          label="MOAs expiring soon"
          value={expiringMoas.length}
          icon={FileClock}
          tone={expiringMoas.length > 0 ? "amber" : "slate"}
          hint="Next 30 days"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>All students compliance</CardTitle>
              <CardDescription>
                {semester
                  ? `Hours, documents and weekly reports for ${semester.name}.`
                  : "Choose a semester to see student compliance."}
              </CardDescription>
            </div>
            {semester && (
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
