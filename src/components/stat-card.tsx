import { Children, cloneElement, isValidElement } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "brand" | "green" | "sky" | "amber" | "rose";

// One hue family per tile so related figures read as a group; the number stays in ink
// on a 74%+ white glass so it always clears 4.5:1.
const TONE: Record<StatTone, { tile: string; ink: string }> = {
  brand: { tile: "from-brand-100/80", ink: "text-brand-600" },
  green: { tile: "from-mint-100/90", ink: "text-beacon" },
  sky: { tile: "from-sky-100/90", ink: "text-sky-700" },
  amber: { tile: "from-amber-100/90", ink: "text-amber-700" },
  rose: { tile: "from-rose-100/90", ink: "text-rose-700" },
};
const CYCLE: StatTone[] = ["brand", "green", "sky", "amber", "rose"];

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  className,
  action = false,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
  /** A queue that needs doing: the tile turns rose while it is above zero. */
  action?: boolean;
  tone?: StatTone;
}) {
  const calling = action && Number(value) > 0;
  const t = TONE[calling ? "rose" : tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl glass bg-gradient-to-br to-white/60 p-4 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 sm:p-5 dark:to-white/0",
        t.tile,
        className
      )}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground/75">
        {Icon && (
          <Icon className={cn("size-4 shrink-0", t.ink)} strokeWidth={2} aria-hidden="true" />
        )}
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-brand-900 tabular-nums sm:text-3xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-foreground/65">{hint}</p>}
      {calling && <p className="mt-1 text-xs font-medium text-rose-700">Needs your action</p>}
    </div>
  );
}

// A row of tiles; each takes the next hue unless it sets its own.
export function StatStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  let i = 0;
  const tiles = Children.map(children, (child) => {
    if (!isValidElement<{ tone?: StatTone }>(child)) return child;
    const tone = child.props.tone ?? CYCLE[i++ % CYCLE.length];
    return cloneElement(child, { tone });
  });
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none max-lg:[&>*:last-child:nth-child(odd)]:col-span-2",
        className
      )}
    >
      {tiles}
    </div>
  );
}
