import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import type { TrackKind, TrackWeek } from "@/lib/utils/internshipTrack";

// The BEACON signature: every internship week as one cell on the way to the finish,
// coloured by where its weekly report stands. The legend swatches are the cells themselves.
const KIND: Record<TrackKind, { label: string; cell: string }> = {
  confirmed: { label: "Approved", cell: "bg-brand-600" },
  review: { label: "Awaiting review", cell: "bg-brand-100 border border-dashed border-brand-600" },
  returned: { label: "Returned", cell: "bg-danger-soft border border-red-300" },
  missing: { label: "Not submitted", cell: "bg-[#c4242a]" },
  open: { label: "Open", cell: "bg-card border border-brand-300" },
  ahead: { label: "Ahead", cell: "bg-brand-100/80" },
};

const fmt = (d: Date) =>
  d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });

export function InternshipTrack({
  weeks,
  finishLabel,
}: {
  weeks: TrackWeek[];
  finishLabel: string | null;
}) {
  const kinds = [...new Set(weeks.map((w) => w.kind))];
  return (
    <figure className="space-y-3">
      <div className="flex items-center gap-3">
        <ol aria-label="Weekly reports by week" className="flex min-w-0 flex-1 items-center gap-1">
          {weeks.map((w) => (
            <li
              key={w.weekStart.toISOString()}
              title={`Week of ${fmt(w.weekStart)} · ${KIND[w.kind].label}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "block h-7 w-full rounded-[4px]",
                  KIND[w.kind].cell,
                  w.isCurrent && "ring-2 ring-brand-600 ring-offset-2 ring-offset-card"
                )}
              />
              <span className="sr-only">
                Week of {fmt(w.weekStart)}: {KIND[w.kind].label}
                {w.isCurrent ? " (this week)" : ""}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex shrink-0 flex-col items-center">
          <BrandMark className="size-9" />
        </div>
      </div>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
        <span>Week of {weeks.length ? fmt(weeks[0].weekStart) : "—"}</span>
        <span className="text-right">
          {finishLabel ? (
            <>
              Finish <span className="font-medium text-foreground">{finishLabel}</span>
            </>
          ) : (
            "Finish date appears once your schedule is set"
          )}
        </span>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {kinds.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("block h-3 w-4 rounded-[3px]", KIND[k].cell)} aria-hidden="true" />
            {KIND[k].label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

// The roster's version: the last few weeks as small cells, oldest first, this week last.
export function MiniTrack({ kinds }: { kinds: TrackKind[] }) {
  return (
    <span
      className="flex items-center gap-0.5"
      role="img"
      aria-label={kinds.map((k) => KIND[k].label).join(", ")}
    >
      {kinds.map((k, i) => (
        <span
          key={i}
          title={KIND[k].label}
          className={cn("block h-3.5 w-2.5 rounded-[2px]", KIND[k].cell)}
        />
      ))}
    </span>
  );
}
