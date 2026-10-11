import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { ShieldCheck } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { EXPORT_KINDS, EXPORT_LABELS, isExportKind } from "@/lib/services/adminExportService";
import { queryAuditLogs } from "@/lib/services/auditLogQuery";
import { listSemesters } from "@/lib/services/semesterService";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportCard } from "./export-card";

const SEMESTER_AWARE = new Set(["students", "attendance", "reports", "checklist"]);

const stampFmt = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

type ExportDetail = { kind?: unknown; semesterId?: unknown; rowCount?: unknown };

function readDetail(detail: unknown): ExportDetail | null {
  return detail && typeof detail === "object" ? (detail as ExportDetail) : null;
}

export default async function ExportCenterPage() {
  const user = await requireUserPage();
  if (user.role !== Role.SUPER_ADMIN) redirect("/");

  const [semesters, recent] = await Promise.all([
    listSemesters(),
    queryAuditLogs({ action: "DATA_EXPORTED", page: 1 }, { pageSize: 20 }),
  ]);
  const semesterOptions = semesters.map((s) => ({
    id: s.id,
    label: `${s.name} (${s.academicYear})`,
  }));
  const semesterLabel = new Map(semesterOptions.map((s) => [s.id, s.label]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Export Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download system data as Excel workbooks. Times are Manila time.
        </p>
      </div>

      <div
        role="note"
        className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4 text-sm text-foreground"
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p>Every export asks for your password and is recorded in the audit log.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXPORT_KINDS.map((kind) => (
          <ExportCard
            key={kind}
            kind={kind}
            title={EXPORT_LABELS[kind].title}
            description={EXPORT_LABELS[kind].description}
            semesters={semesterOptions}
            semesterAware={SEMESTER_AWARE.has(kind)}
          />
        ))}
      </div>

      <section id="data-requests" aria-labelledby="data-requests-heading" className="space-y-2">
        <h2 id="data-requests-heading" className="text-lg font-semibold text-foreground">
          Data requests
        </h2>
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      </section>

      <section id="retention" aria-labelledby="retention-heading" className="space-y-2">
        <h2 id="retention-heading" className="text-lg font-semibold text-foreground">
          File retention
        </h2>
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      </section>

      <section aria-labelledby="recent-exports-heading" className="space-y-3">
        <h2 id="recent-exports-heading" className="text-lg font-semibold text-foreground">
          Recent exports
        </h2>
        {recent.rows.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No exports yet"
            description="Exports you download appear here with who ran them and when."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <caption className="sr-only">Latest 20 exports, newest first</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Export</TableHead>
                  <TableHead>Semester</TableHead>
                  <TableHead>Rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.rows.map((r) => {
                  const d = readDetail(r.detail);
                  const kind = typeof d?.kind === "string" ? d.kind : null;
                  const semesterId = typeof d?.semesterId === "string" ? d.semesterId : null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {stampFmt.format(r.timestamp)}
                      </TableCell>
                      <TableCell>{r.email ?? "—"}</TableCell>
                      <TableCell className="font-medium text-foreground">
                        {kind ? (isExportKind(kind) ? EXPORT_LABELS[kind].title : kind) : "—"}
                      </TableCell>
                      <TableCell>
                        {semesterId ? (semesterLabel.get(semesterId) ?? "—") : "All semesters"}
                      </TableCell>
                      <TableCell>{typeof d?.rowCount === "number" ? d.rowCount : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
