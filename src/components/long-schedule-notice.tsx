import { AlertTriangle } from "lucide-react";
import { longSchedule, type ScheduleConfig } from "@/lib/utils/schedule";

// The 8-hours-a-day limit, shown wherever a schedule is: never a block, never blaming
// the intern (the company sets the hours); the adviser and coordinator act on it.
export function LongScheduleNotice({
  schedule,
  forIntern,
}: {
  schedule: ScheduleConfig;
  forIntern: boolean;
}) {
  const long = longSchedule(schedule);
  if (!long) return null;
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-md border border-notice-border bg-notice p-3 text-sm text-notice-foreground"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="font-medium">Over the 8-hour daily limit</p>
        <p>
          {long.long}{" "}
          {forIntern
            ? "Your hours still count. Your adviser is told and may talk with your company."
            : "Talk with the company about an 8-hour schedule, or decide whether the intern should stay."}
        </p>
      </div>
    </div>
  );
}
