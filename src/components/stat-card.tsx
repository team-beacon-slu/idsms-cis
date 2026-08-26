import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardTone = "blue" | "green" | "amber" | "red" | "slate";

const ICON_WRAP_CLASSES: Record<StatCardTone, string> = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  green: "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  hint,
  className,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: StatCardTone;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("transition-shadow hover:shadow-md", className)}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn("shrink-0 rounded-lg p-2.5", ICON_WRAP_CLASSES[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}
