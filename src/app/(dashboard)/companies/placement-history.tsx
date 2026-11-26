import { formatCalendarDate } from "@/lib/documents/html";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { listPlacementsForStudent } from "@/lib/services/predeployment/placementService";

type Placements = Awaited<ReturnType<typeof listPlacementsForStudent>>;

const END_REASON: Record<string, string> = {
  RETRACTED: "Pulled out / transferred",
  COMPLETED: "Completed",
};

// The intern's host companies in order, with dates, why each ended, and supervisor changes.
// Hours rendered at every company count toward the same required hours.
export function PlacementHistory({ placements }: { placements: Placements }) {
  if (placements.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your companies</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every company you were placed at, with dates. Hours from each one count toward your
          required hours.
        </p>
      </CardHeader>
      <CardContent>
        <ol className="divide-y rounded-lg border text-sm">
          {placements.map((p) => (
            <li key={p.id} className="space-y-1 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{p.company.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatCalendarDate(p.startedOn)} –{" "}
                  {p.endedOn ? formatCalendarDate(p.endedOn) : "present"}
                </span>
              </div>
              {p.endedOn && (
                <p className="text-muted-foreground">
                  {END_REASON[p.endReason ?? ""] ?? "Ended"}
                  {p.retractionReason ? `: ${p.retractionReason}` : ""}
                </p>
              )}
              {!p.endedOn && p.retractionFiledAt && p.retractionLastDay && (
                <p className="text-muted-foreground">
                  Notice of retraction filed; last day {formatCalendarDate(p.retractionLastDay)}.
                  Waiting for SAMCIS to note it.
                </p>
              )}
              <p className="text-muted-foreground">
                Supervisor: {p.company.supervisorName}
                {p.supervisors.map((s) => (
                  <span key={s.id}>
                    {" "}
                    → {s.supervisorName} (from {formatCalendarDate(s.effectiveFrom)})
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
