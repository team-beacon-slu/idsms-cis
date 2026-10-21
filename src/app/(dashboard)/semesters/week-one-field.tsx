"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Workstream L1: the faculty-defined Week 1 start that numbers weekly reports.
export function WeekOneField({
  semesterId,
  name,
  value,
}: {
  semesterId: string;
  name: string;
  value: string; // "YYYY-MM-DD" or ""
}) {
  const router = useRouter();
  const [date, setDate] = useState(value);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const res = await sendJson(`/api/semesters/${semesterId}`, {
      method: "PATCH",
      body: { weekOneStart: date || null },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Week 1 for ${name} saved`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        aria-label={`Week 1 starts (${name})`}
        value={date}
        disabled={pending}
        onChange={(e) => setDate(e.target.value)}
        className="w-40"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pending || date === value}
        onClick={save}
        className="cursor-pointer"
      >
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
