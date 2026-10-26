"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendJson } from "@/lib/utils/sendJson";

export const MIN_JOURNAL_CHARS = 200; // same floor as monthlyReportService

// SLU's Journal on Learning Experience for one month: the intern's own narrative,
// printed under their office. Not noted by the work supervisor.
export function JournalEditor({
  studentProfileId,
  calendarMonth,
  initialNarrative,
  initialOffice,
  readOnly,
}: {
  studentProfileId: string;
  calendarMonth: string;
  initialNarrative: string;
  initialOffice: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [narrative, setNarrative] = useState(initialNarrative);
  const [office, setOffice] = useState(initialOffice);
  const [saving, setSaving] = useState(false);
  const id = `jle-${calendarMonth}`;

  if (readOnly) {
    return initialNarrative ? (
      <p className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
        {initialNarrative}
      </p>
    ) : (
      <p className="text-sm text-muted-foreground">No journal written for this month yet.</p>
    );
  }

  async function save() {
    setSaving(true);
    const res = await sendJson(`/api/students/${studentProfileId}/monthly-reports/journal`, {
      method: "PUT",
      body: { calendarMonth, narrative, office },
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Journal saved");
    router.refresh();
  }

  const length = narrative.trim().length;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-office`}>Office / department</Label>
        <Input
          id={`${id}-office`}
          value={office}
          maxLength={150}
          onChange={(e) => setOffice(e.target.value)}
          placeholder="e.g. IT Department, Systems Development Unit"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id}>Journal on Learning Experience</Label>
        <p className="text-xs text-muted-foreground">
          Your observations, reflections and insights this month: problems you met and how you
          solved them, accomplishments, disappointments or mistakes, and the technical and soft
          skills you learned. Leave a blank line between topics. Your supervisor does not sign this.
        </p>
        <Textarea
          id={id}
          value={narrative}
          maxLength={20000}
          rows={10}
          onChange={(e) => setNarrative(e.target.value)}
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {length < MIN_JOURNAL_CHARS
            ? `${MIN_JOURNAL_CHARS - length} more characters before you can submit`
            : `${length} characters`}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={saving}
        onClick={save}
        className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
      >
        <Save className="size-3.5" aria-hidden="true" />
        {saving ? "Saving..." : "Save journal"}
      </Button>
    </div>
  );
}
