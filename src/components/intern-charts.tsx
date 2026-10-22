import Link from "next/link";
import {
  summarize,
  type ComplianceRow,
  type ComplianceStatus,
} from "@/lib/services/complianceService";
import {
  HOURS_BUCKETS,
  STATUS_ORDER,
  WEEK_KINDS,
  hoursBuckets,
  statusCounts,
  weeklyColumns,
} from "@/lib/utils/internCharts";
import { KIND } from "@/components/internship-track";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS: Record<ComplianceStatus, { label: string; fill: string }> = {
  COMPLETED: { label: "Completed", fill: "bg-status-done" },
  ON_TRACK: { label: "On track", fill: "bg-status-on" },
  NEEDS_ATTENTION: { label: "Needs attention", fill: "bg-status-alert" },
  NOT_DEPLOYED: { label: "Not deployed", fill: "bg-status-idle" },
};
// Sequential: one hue, pale to full, so more hours reads as more ink.
const HOURS_FILL = ["bg-brand-200", "bg-brand-300", "bg-brand-600/70", "bg-brand-600", "bg-beacon"];
const weekLabel = (ago: number) => (ago === 0 ? "Now" : `−${ago}w`);
const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

// Three pictures of the roster the dashboards already load: where interns stand, how
// the weekly reports have gone, and how far along the hours are. Every mark has a hover
// title and every chart a screen-reader table, so nothing is colour alone.
export function InternCharts({
  rows,
  statusHref,
  activeStatus,
}: {
  rows: ComplianceRow[];
  /** When set, each status in the legend filters the roster below; no argument clears it. */
  statusHref?: (status?: ComplianceStatus) => string;
  activeStatus?: ComplianceStatus;
}) {
  if (rows.length === 0) return null;
  const counts = statusCounts(rows);
  const columns = weeklyColumns(rows);
  const tallest = Math.max(1, ...columns.map((c) => c.total));
  // The due week, counted like the stat cards: interns who never filed count as not filed.
  const { submittedThisWeek, notYetSubmitted } = summarize(rows);
  const due = submittedThisWeek + notYetSubmitted;
  const buckets = hoursBuckets(rows);
  const peak = Math.max(1, ...buckets);
  const behind = buckets[0] + buckets[1];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Where interns stand</CardTitle>
          <CardDescription>
            {counts.NEEDS_ATTENTION > 0
              ? `${counts.NEEDS_ATTENTION} of ${rows.length} need attention.`
              : `None of ${rows.length} need attention.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-4 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
            {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <span
                key={s}
                title={`${STATUS[s].label}: ${counts[s]}`}
                className={cn("h-full", STATUS[s].fill)}
                style={{ width: `${pct(counts[s], rows.length)}%` }}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {STATUS_ORDER.map((s) => {
              const body = (
                <>
                  <span className={cn("size-2.5 shrink-0 rounded-full", STATUS[s].fill)} />
                  <span className="min-w-0 flex-1 truncate text-foreground/80">
                    {STATUS[s].label}
                  </span>
                  <span className="font-semibold text-foreground tabular-nums">{counts[s]}</span>
                </>
              );
              return (
                <li key={s}>
                  {statusHref ? (
                    <Link
                      href={statusHref(s)}
                      aria-current={activeStatus === s ? "true" : undefined}
                      className={cn(
                        "-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
                        activeStatus === s && "bg-brand-50 ring-1 ring-brand-300"
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 py-1">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {statusHref && activeStatus && (
            <Link
              href={statusHref()}
              className="inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Show all statuses
            </Link>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Weekly reports, last 8 weeks</CardTitle>
          <CardDescription>
            {due > 0
              ? `Reports due now: ${submittedThisWeek} of ${due} filed (${pct(submittedThisWeek, due)}%).`
              : "No reports are due yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-32 items-end gap-1.5" aria-hidden="true">
            {columns.map((c) => (
              <div
                key={c.weeksAgo}
                className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5"
              >
                <div
                  className="flex w-full flex-1 flex-col-reverse gap-[2px]"
                  title={`${weekLabel(c.weeksAgo)}: ${
                    WEEK_KINDS.filter((k) => c.counts[k] > 0)
                      .map((k) => `${KIND[k].label} ${c.counts[k]}`)
                      .join(", ") || "no interns yet"
                  }`}
                >
                  {WEEK_KINDS.filter((k) => c.counts[k] > 0).map((k, i, shown) => (
                    <span
                      key={k}
                      className={cn(
                        "block w-full rounded-[2px]",
                        KIND[k].cell,
                        i === shown.length - 1 && "rounded-t-[4px]"
                      )}
                      style={{ height: `${(c.counts[k] / tallest) * 100}%` }}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {weekLabel(c.weeksAgo)}
                </span>
              </div>
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {WEEK_KINDS.map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-[3px]", KIND[k].cell)} />
                {KIND[k].label}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Hours completed</CardTitle>
          <CardDescription>
            {behind > 0
              ? `${behind} of ${rows.length} are under halfway to their required hours.`
              : `All ${rows.length} are at least halfway.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-end gap-2" aria-hidden="true">
            {buckets.map((n, i) => (
              <div
                key={HOURS_BUCKETS[i]}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              >
                <span className="text-xs font-semibold text-foreground tabular-nums">{n}</span>
                <span
                  title={`${HOURS_BUCKETS[i]} of required hours: ${n}`}
                  className={cn("block w-full rounded-t-[4px]", HOURS_FILL[i])}
                  style={{ height: `${Math.max(n > 0 ? 4 : 0, (n / peak) * 72)}%` }}
                />
                <span className="text-[11px] text-muted-foreground">{HOURS_BUCKETS[i]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* sr-only on the wrapper: a <table> ignores the 1px width and would overflow phones. */}
      <div className="sr-only">
        <table>
          <caption>Intern charts as a table</caption>
          <tbody>
            {STATUS_ORDER.map((s) => (
              <tr key={s}>
                <th scope="row">{STATUS[s].label}</th>
                <td>{counts[s]}</td>
              </tr>
            ))}
            {columns.map((c) => (
              <tr key={c.weeksAgo}>
                <th scope="row">Weekly reports {weekLabel(c.weeksAgo)}</th>
                <td>{WEEK_KINDS.map((k) => `${KIND[k].label} ${c.counts[k]}`).join(", ")}</td>
              </tr>
            ))}
            {buckets.map((n, i) => (
              <tr key={HOURS_BUCKETS[i]}>
                <th scope="row">Hours {HOURS_BUCKETS[i]}</th>
                <td>{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
