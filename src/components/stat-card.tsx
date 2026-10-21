import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// A KPI is type, not a tile: grey label (with an optional small glyph), the value in ink
// with tabular figures, and an optional grey hint. No tinted icon square, no hover lift.
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />}
          {label}
        </p>
        <p className="mt-1.5 text-2xl font-medium tracking-tight text-foreground tabular-nums">
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// Several KPIs share one container split by hairlines, rather than one tile each.
export function StatStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "grid grid-cols-2 divide-border overflow-hidden sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none sm:divide-x [&>*]:rounded-none [&>*]:border-0",
        className
      )}
    >
      {children}
    </Card>
  );
}
