"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { CalendarPlus, Plus, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Row = { period: string; area: string; description: string; output: string; hours: string };
const blank = (): Row => ({ period: "", area: "", description: "", output: "", hours: "" });

const toRow = (r: {
  period?: string;
  area?: string;
  description: string;
  output?: string;
  hours?: number;
}): Row => ({
  period: r.period ?? "",
  area: r.area ?? "",
  description: r.description,
  output: r.output ?? "",
  hours: r.hours == null ? "" : String(r.hours),
});

// The work plan in the company's own template (the adviser: every company has one), as an
// uploaded PDF, with its rows typed in or read from it by AI assist. The rows feed plan
// coverage; days off the plan marks can go straight onto the intern's calendar.
export function WorkPlanSubmitForm({
  studentProfileId,
  aiRead,
}: {
  studentProfileId: string;
  aiRead: boolean; // AI assist can read uploaded files for this intern
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [daysOff, setDaysOff] = useState<{ date: string; name: string; added?: boolean }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function readWithAi() {
    if (!file) return;
    setReading(true);
    const form = new FormData();
    form.set("file", file);
    try {
      const res = await fetch(`/api/students/${studentProfileId}/work-plans/read`, {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "AI assist couldn't read the file");
        return;
      }
      if (body.rows?.length) setRows(body.rows.map(toRow));
      setDaysOff(body.daysOff ?? []);
      toast.success(
        `Read ${body.rows?.length ?? 0} rows and ${body.daysOff?.length ?? 0} days off. Check them before you submit.`
      );
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setReading(false);
    }
  }

  async function addDayOff(i: number) {
    const d = daysOff[i];
    const res = await sendJson(`/api/students/${studentProfileId}/holidays`, {
      method: "POST",
      body: { date: d.date, name: d.name },
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDaysOff((list) => list.map((x, j) => (j === i ? { ...x, added: true } : x)));
    toast.success(`${d.name} added to your calendar`);
  }
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

    if (!file && plannedTasks.length === 0) {
      toast.error("Upload your work plan or add at least one row with its tasks");
      return;
    }

    setIsSubmitting(true);
    const form = new FormData();
    form.set("plan", JSON.stringify({ plannedTasks }));
    if (file) form.set("file", file);
    try {
      const res = await fetch(`/api/students/${studentProfileId}/work-plans`, {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not submit the work plan");
        return;
      }
      toast.success("Work plan submitted");
      setRows([blank()]);
      setFile(null);
      setDaysOff([]);
      router.refresh();
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a work plan</CardTitle>
        <CardDescription>
          Upload the work plan in your company&apos;s own template (PDF, up to 5 MB). Add its rows
          below so IDSMS can track your planned tasks; no template? The rows print as the SAMCIS
          sample. The committee reviews it before your MOA is processed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <Label htmlFor="wp-file">Work plan (PDF)</Label>
            <Input
              id="wp-file"
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setDaysOff([]);
              }}
            />
            {aiRead && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!file || reading}
                onClick={readWithAi}
                className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                {reading ? "Reading..." : "Fill the rows with AI assist"}
              </Button>
            )}
            {daysOff.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-sm font-medium">Days off in your work plan</p>
                <p className="text-xs text-muted-foreground">
                  Add the ones that are right to your calendar; your adviser sees them too.
                </p>
                <ul className="space-y-1">
                  {daysOff.map((d, i) => (
                    <li key={d.date + d.name} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="tabular-nums">{d.date}</span>
                      <span className="flex-1">{d.name}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={d.added}
                        onClick={() => addDayOff(i)}
                        className="cursor-pointer gap-1.5"
                      >
                        <CalendarPlus className="size-3.5" aria-hidden="true" />
                        {d.added ? "Added" : "Add to calendar"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
