"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// FR-WR-01 manual "generate this week" trigger → POST
// /api/students/[studentProfileId]/weekly-reports → generateWeeklyReportForm.
// Any date works — the service snaps it to that week's Monday and returns
// the existing report if one was already generated.

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function GenerateWeekButton({ studentProfileId }: { studentProfileId: string }) {
  const router = useRouter();
  const [weekOf, setWeekOf] = useState(() => localDateKey(new Date()));
  const [isPending, setIsPending] = useState(false);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    const res = await sendJson(`/api/students/${studentProfileId}/weekly-reports`, {
      method: "POST",
      body: { weekStart: weekOf },
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Weekly report ready — fill in each day below");
    router.refresh();
  }

  return (
    <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
      <div className="space-y-2">
        <Label htmlFor="week-of">Week of</Label>
        <Input
          id="week-of"
          type="date"
          value={weekOf}
          max={localDateKey(new Date())}
          onChange={(e) => setWeekOf(e.target.value)}
          disabled={isPending}
          className="w-44"
        />
      </div>
      <Button
        type="submit"
        disabled={isPending || !weekOf}
        className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
      >
        <CalendarPlus className="size-4" aria-hidden="true" />
        {isPending ? "Preparing..." : "Start weekly report"}
      </Button>
    </form>
  );
}
