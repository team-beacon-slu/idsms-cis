import { Copy, Eye, ListChecks, MessageSquareQuote, ShieldAlert, Sparkles } from "lucide-react";
import type { AdvisoryView } from "@/lib/ai/display";
import { HintRating } from "@/components/ai/hint-rating";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });

function Hint({
  icon: Icon,
  title,
  children,
  rate,
}: {
  icon: typeof Copy;
  title: string;
  children: React.ReactNode;
  rate?: { job: string; targetId: string };
}) {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium text-foreground">{title}</p>
        {children}
        {rate && <HintRating job={rate.job} targetId={rate.targetId} />}
      </div>
    </div>
  );
}

// The adviser's AI hints for one weekly report (ai-assist-plan §6). Each points to what the
// intern wrote and can be rated; none decides anything.
export function AiHints({
  view,
  reportId,
  texts,
}: {
  view: AdvisoryView;
  reportId: string;
  texts: Record<string, string>; // entry id -> what the intern wrote (incl. the earlier day)
}) {
  const any =
    view.pending ||
    view.similar ||
    view.tone ||
    view.summary.length ||
    view.coverage ||
    view.addressedToAi.length;
  if (!any) return null;
  return (
    <section aria-labelledby="ai-hints" className="space-y-3">
      <h2 id="ai-hints" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="size-4 text-brand-700" aria-hidden="true" />
        AI assist
        <span className="font-normal text-muted-foreground">
          · hints for your review, never a decision
        </span>
      </h2>

      {view.pending && (
        <p className="text-sm text-muted-foreground">Hints are prepared overnight.</p>
      )}

      {view.summary.length > 0 && (
        <Hint
          icon={MessageSquareQuote}
          title="What the intern wrote, not an assessment"
          rate={{ job: "summary", targetId: reportId }}
        >
          <ul className="space-y-1">
            {view.summary.map((s) => (
              <li key={s.entryId} className="text-foreground/85">
                <span className="text-xs text-muted-foreground">{fmt(s.date)}: </span>“{s.quote}”
              </li>
            ))}
          </ul>
        </Hint>
      )}

      {view.similar && (
        <Hint
          icon={Copy}
          title={`${fmt(view.similar.date)} is very similar to ${fmt(view.similar.prevDate)}`}
          rate={{ job: "copy", targetId: reportId }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              [view.similar.date, view.similar.entryId],
              [view.similar.prevDate, view.similar.prevEntryId],
            ].map(([date, id]) => (
              <blockquote key={id} className="rounded-md border bg-card p-2 text-foreground/85">
                <span className="block text-xs text-muted-foreground">{fmt(date)}</span>
                {texts[id] ?? "(entry no longer available)"}
              </blockquote>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Repetitive work is normal; judge it yourself. Similarity score{" "}
            {view.similar.score.toFixed(2)}. It never affects deductions.
          </p>
        </Hint>
      )}

      {view.tone && (
        <Hint icon={Eye} title="Worth a look" rate={{ job: "tone", targetId: reportId }}>
          <p className="text-foreground/85">
            <span className="text-xs text-muted-foreground">{fmt(view.tone.date)}: </span>“
            {view.tone.quote}”
          </p>
          <p className="text-xs text-muted-foreground">Only you see this; the intern never does.</p>
        </Hint>
      )}

      {view.coverage && (
        <Hint
          icon={ListChecks}
          title={`Planned tasks not found in the last ${view.coverage.weeks} weeks of entries`}
          rate={{ job: "coverage", targetId: reportId }}
        >
          <ul className="list-disc space-y-0.5 pl-5 text-foreground/85">
            {view.coverage.missing.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            “Not found” is not “not done”: ask the intern before drawing a conclusion.
          </p>
        </Hint>
      )}

      {view.addressedToAi.length > 0 && (
        <Hint icon={ShieldAlert} title="An entry contains text addressed to the AI">
          <p className="text-foreground/85">
            {view.addressedToAi.map((a) => fmt(a.date)).join(", ")}: the AI did not quote or follow
            it. Read that day yourself.
          </p>
        </Hint>
      )}
    </section>
  );
}
