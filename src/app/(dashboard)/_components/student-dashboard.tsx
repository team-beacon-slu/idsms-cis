import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WeeklyHistoryRow } from "@/lib/services/dashboards/complianceService";
import { requirementLabel } from "@/lib/utils/requirementLabel";

// An empty block keeps its frame and says one thing.
function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

// Index-tab folders (after Mosby's Files): each requirement is a folder whose tab colour
// is its status, so the whole checklist reads at a glance.
const FOLDER: Record<string, { tab: string; label: string }> = {
  APPROVED: { tab: "bg-[#2f6b4f]", label: "Approved" },
  PENDING: { tab: "bg-brand-300", label: "Pending" },
  RETURNED: { tab: "bg-rose-500", label: "Returned" },
  NOT_STARTED: { tab: "bg-slate-300", label: "Not started" },
};

const PHONE_CHIPS = 3;

// FR-DB-02: per-requirement checklist status and weekly report history, as bento tiles.
export function StudentDashboardTables({
  requirements,
  history,
  aside,
}: {
  requirements: Array<{ requirementType: string; status: string; required: boolean }>;
  history: WeeklyHistoryRow[];
  /** Shown under Recent weeks, so the right column matches the checklist's height. */
  aside?: React.ReactNode;
}) {
  const approved = requirements.filter((r) => r.required && r.status === "APPROVED").length;
  const required = requirements.filter((r) => r.required).length;
  const todo = requirements.filter((r) => r.status !== "APPROVED");
  return (
    <>
      <Card className="md:col-span-6 xl:col-span-8">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg text-brand-900">Pre-deployment requirements</CardTitle>
            <CardDescription>
              {approved} of {required} required approved · submitted in Google Classroom
            </CardDescription>
          </div>
          <Link
            href="/checklist"
            className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-brand-600 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Open checklist
          </Link>
        </CardHeader>
        <CardContent>
          {requirements.length === 0 ? (
            <EmptyLine>No requirements are tracked yet. Your coordinator adds them.</EmptyLine>
          ) : (
            <div className="space-y-3">
              <div
                role="progressbar"
                aria-label="Required items approved"
                aria-valuemin={0}
                aria-valuemax={required}
                aria-valuenow={approved}
                className="h-2.5 overflow-hidden rounded-full bg-brand-100 dark:bg-white/10"
              >
                <div
                  className="h-full rounded-full bg-[#2f6b4f] transition-[width]"
                  style={{ width: `${required ? (approved / required) * 100 : 0}%` }}
                />
              </div>
              {todo.length === 0 ? (
                <p className="text-sm font-medium text-[#2f6b4f] dark:text-emerald-300">
                  All required items approved.
                </p>
              ) : (
                // Only what still needs doing, as compact chips: the full folder grid repeated
                // the "Needs attention" count and ran about a screen long on phones.
                <ul aria-label="Still to do" className="flex flex-wrap gap-2">
                  {todo.map((item, i) => {
                    const f = FOLDER[item.status] ?? FOLDER.NOT_STARTED;
                    return (
                      <li
                        key={item.requirementType}
                        className={cn(
                          "flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-sm dark:border-white/8 dark:bg-white/5",
                          // Phones: long names take a line each, so show three and link the rest.
                          i >= PHONE_CHIPS && "max-sm:hidden"
                        )}
                      >
                        <span aria-hidden="true" className={cn("size-2.5 rounded-full", f.tab)} />
                        <span className="font-medium text-foreground">
                          {requirementLabel(item.requirementType)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {f.label}
                          {!item.required && " · optional"}
                        </span>
                      </li>
                    );
                  })}
                  {todo.length > PHONE_CHIPS && (
                    <li className="sm:hidden">
                      <Link
                        href="/checklist"
                        className="inline-block rounded-full px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        +{todo.length - PHONE_CHIPS} more in your checklist
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 md:col-span-6 xl:col-span-4">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-lg text-brand-900">Recent weeks</CardTitle>
              <CardDescription>Newest first</CardDescription>
            </div>
            <Link
              href="/weekly-reports"
              className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-brand-600 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-ring"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <EmptyLine>No weekly reports yet. Start this week from Weekly reports.</EmptyLine>
            ) : (
              <ul className="divide-y divide-brand-100/80">
                {history.slice(0, 5).map((row) => (
                  <li
                    key={row.id}
                    className="flex min-h-12 items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{row.week}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.referenceCode ?? "Not submitted"}
                      </span>
                    </span>
                    <StatusBadge status={row.state} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {aside}
      </div>
    </>
  );
}
