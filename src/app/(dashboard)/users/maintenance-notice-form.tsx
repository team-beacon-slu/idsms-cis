"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// NFR-REL-01: one banner on every signed-in page; Clear removes it.
export function MaintenanceNoticeForm({ initial }: { initial: string }) {
  const [message, setMessage] = useState(initial);
  const [isPending, setIsPending] = useState(false);

  async function save(next: string) {
    setIsPending(true);
    try {
      const res = await fetch("/api/config/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not save the notice");
        return;
      }
      setMessage(body.message);
      toast.success(body.message ? "Notice shown to everyone" : "Notice cleared");
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(message);
      }}
      className="space-y-3"
    >
      <div className="space-y-2">
        <Label htmlFor="maintenance-notice">Message</Label>
        <Textarea
          id="maintenance-notice"
          maxLength={300}
          rows={2}
          placeholder="e.g. IDSMS will be down for maintenance on Sat, Nov 14, 8–10 PM."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={isPending}
          className="cursor-pointer disabled:cursor-not-allowed"
        >
          {isPending ? "Saving..." : "Show to everyone"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !message}
          onClick={() => save("")}
          className="cursor-pointer disabled:cursor-not-allowed"
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
