"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendJson } from "@/lib/utils/sendJson";

const SELECT =
  "flex h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm";

// The intern's notification of retraction (SLU guidelines IV.1.e): their last day and why.
export function RetractionForm({ studentProfileId }: { studentProfileId: string }) {
  const router = useRouter();
  const [lastDay, setLastDay] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await sendJson(`/api/students/${studentProfileId}/retraction`, {
      method: "POST",
      body: { lastDay, reason },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Notification of retraction sent to SAMCIS");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="space-y-1">
          <Label htmlFor="retraction-day">Last day at this company</Label>
          <Input
            id="retraction-day"
            type="date"
            required
            value={lastDay}
            onChange={(e) => setLastDay(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="retraction-reason">Reason</Label>
          <Textarea
            id="retraction-reason"
            rows={2}
            required
            minLength={10}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="cursor-pointer disabled:cursor-not-allowed"
      >
        {pending ? "Sending..." : "File notification of retraction"}
      </Button>
    </form>
  );
}

export function NoteRetractionButton({ placementId }: { placementId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function note() {
    setPending(true);
    const res = await sendJson(`/api/placements/${placementId}/note`, { method: "POST" });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Retraction noted; the intern can join another company");
    router.refresh();
  }
  return (
    <Button size="sm" disabled={pending} onClick={note} className="cursor-pointer">
      {pending ? "Noting..." : "Note retraction"}
    </Button>
  );
}

export function VisitForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [visitedOn, setVisitedOn] = useState("");
  const [mode, setMode] = useState("ON_SITE");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await sendJson(`/api/companies/${companyId}/visits`, {
      method: "POST",
      body: { visitedOn, mode, notes },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Company visit recorded");
    setVisitedOn("");
    setNotes("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[12rem_10rem_1fr]">
        <div className="space-y-1">
          <Label htmlFor="visit-day">Visited on</Label>
          <Input
            id="visit-day"
            type="date"
            required
            value={visitedOn}
            onChange={(e) => setVisitedOn(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="visit-mode">How</Label>
          <select
            id="visit-mode"
            className={SELECT}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="ON_SITE">On site</option>
            <option value="ONLINE">Online</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="visit-notes">Notes (optional)</Label>
          <Input
            id="visit-notes"
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Who you met, what was discussed"
          />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={pending} className="cursor-pointer">
        {pending ? "Saving..." : "Record visit"}
      </Button>
    </form>
  );
}
