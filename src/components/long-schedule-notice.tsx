import { AlertTriangle } from "lucide-react";
import { longSchedule, type ScheduleConfig } from "@/lib/utils/schedule";

// A schedule longer than the usual 8-hour day, for staff only: the company sets the hours, so
// the intern is not shown it; the adviser and coordinator act on it. Never a block.
export function LongScheduleNotice({
  schedule,
  forIntern,
}: {
  schedule: ScheduleConfig;
  forIntern: boolean;
}) {
  const long = longSchedule(schedule);
  if (!long || forIntern) return null;
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-md border border-notice-border bg-notice p-3 text-sm text-notice-foreground"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="font-medium">Longer than an 8-hour day</p>
        <p>
          {long.long} Talk with the company about an 8-hour schedule, or decide whether the intern
          should stay.
        </p>
      </div>
    </div>
  );
}
