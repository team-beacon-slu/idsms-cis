"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Row = { period: string; area: string; description: string; output: string; hours: string };
const blank = (): Row => ({ period: "", area: "", description: "", output: "", hours: "" });

// SAMCIS's sample work plan: a roadmap aligning the trainee's daily/weekly tasks with the
// HTE's expectations, one row per period.
export function WorkPlanSubmitForm({ studentProfileId }: { studentProfileId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const set = (i: number, key: keyof Row, value: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const total = rows.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const plannedTasks = rows
      .filter((r) => r.description.trim())
      .map((r) => ({
        description: r.description.trim(),
        ...(r.period.trim() && { period: r.period.trim() }),
        ...(r.area.trim() && { area: r.area.trim() }),
        ...(r.output.trim() && { output: r.output.trim() }),
        ...(r.hours.trim() && { hours: Number(r.hours) }),
      }));

    if (plannedTasks.length === 0) {
      toast.error("Add at least one row with its specific tasks");
      return;
    }

    setIsSubmitting(true);
    const res = await sendJson(`/api/students/${studentProfileId}/work-plans`, {
      method: "POST",
      body: { plannedTasks },
    });
    setIsSubmitting(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    toast.success("Work plan submitted");
    setRows([blank()]);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a work plan</CardTitle>
        <CardDescription>
          A roadmap of your daily or weekly tasks with your host company, one row per period. Follow
          your company&apos;s own template if it has one; this is the SAMCIS sample&apos;s layout.
          The committee reviews it before your MOA is processed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {rows.map((r, i) => (
            <fieldset key={i} className="space-y-3 rounded-lg border p-3">
              <legend className="flex items-center gap-2 px-1 text-sm font-medium">
                Row {i + 1}
                {rows.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove row ${i + 1}`}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    className="size-7 cursor-pointer"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                )}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`wp-period-${i}`}>Period</Label>
                  <Input
                    id={`wp-period-${i}`}
                    value={r.period}
                    maxLength={100}
                    placeholder="June 10 – June 14, 2026"
                    onChange={(e) => set(i, "period", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`wp-area-${i}`}>Area/Topic</Label>
                  <Input
                    id={`wp-area-${i}`}
                    value={r.area}
                    maxLength={150}
                    placeholder="Planning phase"
                    onChange={(e) => set(i, "area", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`wp-tasks-${i}`}>Specific tasks (one per line)</Label>
                <Textarea
                  id={`wp-tasks-${i}`}
                  rows={3}
                  value={r.description}
                  maxLength={2000}
                  placeholder={"Identifying technical requirements\nDeveloping project schedule"}
                  onChange={(e) => set(i, "description", e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <div className="space-y-1">
                  <Label htmlFor={`wp-output-${i}`}>Expected output</Label>
                  <Input
                    id={`wp-output-${i}`}
                    value={r.output}
                    maxLength={500}
                    placeholder="Project plan of the web-based system"
                    onChange={(e) => set(i, "output", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`wp-hours-${i}`}>No. of hours</Label>
                  <Input
                    id={`wp-hours-${i}`}
                    type="number"
                    min={0}
                    max={1000}
                    step={0.5}
                    value={r.hours}
                    onChange={(e) => set(i, "hours", e.target.value)}
                  />
                </div>
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((rs) => [...rs, blank()])}
              className="cursor-pointer gap-1.5"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add a row
            </Button>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Total hours (overtime not included): {Math.round(total * 100) / 100}
            </p>
          </div>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
          >
            <Send className="size-3.5" aria-hidden="true" />
            {isSubmitting ? "Submitting..." : "Submit work plan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
