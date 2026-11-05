"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Efficiency item 33: the academic year follows the start date. SLU's year opens in
// June-August, so a semester starting June or later is Y-(Y+1); earlier ones (2nd semester,
// summer) belong to (Y-1)-Y.
export function academicYearFor(startDate: string): string {
  const [y, m] = startDate.split("-").map(Number);
  if (!y || !m) return "";
  return m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function CreateSemesterForm() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [year, setYear] = useState("");
  const [yearTyped, setYearTyped] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setIsPending(true);
    try {
      const res = await fetch("/api/semesters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          academicYear: data.get("academicYear"),
          startDate: data.get("startDate"),
          endDate: data.get("endDate"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.issues?.[0]?.message ?? body.error ?? "Could not create the semester");
        return;
      }
      toast.success("Semester created");
      form.reset();
      setYear("");
      setYearTyped(false);
      router.refresh();
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Create semester"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] lg:items-end"
    >
      <div className="space-y-2">
        <Label htmlFor="semester-name">Name</Label>
        <Input id="semester-name" name="name" required maxLength={80} placeholder="1st Semester" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="semester-year">Academic year</Label>
        <Input
          id="semester-year"
          name="academicYear"
          required
          pattern="\d{4}-\d{4}"
          placeholder="2026-2027"
          aria-describedby="semester-year-help"
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
            setYearTyped(true);
          }}
        />
        <p id="semester-year-help" className="text-xs text-muted-foreground">
          Filled from the start date. Format: 2026-2027
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="semester-start">Start date</Label>
        <Input
          id="semester-start"
          name="startDate"
          type="date"
          required
          onChange={(e) => {
            if (!yearTyped) setYear(academicYearFor(e.target.value));
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="semester-end">End date</Label>
        <Input id="semester-end" name="endDate" type="date" required />
      </div>
      <Button type="submit" disabled={isPending} className="cursor-pointer">
        {isPending ? "Creating…" : "Create semester"}
      </Button>
    </form>
  );
}
