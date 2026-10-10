"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function WorkPlanSubmitForm({ studentProfileId }: { studentProfileId: string }) {
  const router = useRouter();
  const [tasksText, setTasksText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const plannedTasks = tasksText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((description) => ({ description }));

    if (plannedTasks.length === 0) {
      toast.error("Add at least one planned task");
      return;
    }

    setIsSubmitting(true);
    const res = await fetch(`/api/students/${studentProfileId}/work-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannedTasks }),
    });
    setIsSubmitting(false);

    if (!res.ok) {
      const body = await res.json();
      toast.error(body.error ?? "Failed to submit work plan");
      return;
    }

    toast.success("Work plan submitted");
    setTasksText("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a work plan</CardTitle>
        <CardDescription>
          One planned task per line. Your coordinator will review it next.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="planned-tasks">Planned tasks</Label>
            <Textarea
              id="planned-tasks"
              value={tasksText}
              onChange={(e) => setTasksText(e.target.value)}
              placeholder={"Set up dev environment\nBuild feature X\nWrite tests"}
              rows={6}
              className="resize-y"
            />
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
