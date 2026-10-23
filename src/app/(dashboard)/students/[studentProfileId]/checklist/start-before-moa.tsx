"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// The adviser decides per intern whether they may start before the MOA is approved
// (decision of 12 Oct 2026). Allowing takes the MOA out of the endorsement gate.
export function StartBeforeMoa({
  studentProfileId,
  allowed,
  reason,
  canEdit,
}: {
  studentProfileId: string;
  allowed: boolean;
  reason: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  if (!canEdit && !allowed) return null;

  async function save(next: boolean) {
    setPending(true);
    const res = await sendJson(`/api/students/${studentProfileId}/start-before-moa`, {
      method: "POST",
      body: next ? { allowed: true, reason: draft } : { allowed: false },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(next ? "Allowed to start before MOA approval" : "Override removed");
    setDraft("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start before MOA approval</CardTitle>
        <CardDescription>
          {allowed
            ? "Allowed: the MOA does not hold back the endorsement letter for this intern."
            : "Off: the MOA must be approved before the endorsement letter."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {allowed && reason && (
          <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900">
            Reason: {reason}
          </p>
        )}
        {canEdit &&
          (allowed ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void save(false)}
              className="cursor-pointer"
            >
              {pending ? "Saving..." : "Remove override"}
            </Button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save(true);
              }}
              className="space-y-2"
            >
              <Label htmlFor="start-before-moa-reason">Reason</Label>
              <Textarea
                id="start-before-moa-reason"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                required
                minLength={5}
                maxLength={500}
                placeholder="e.g. MOA signed by the HTE; awaiting university notarization"
              />
              <Button type="submit" size="sm" disabled={pending} className="cursor-pointer">
                {pending ? "Saving..." : "Allow to start"}
              </Button>
            </form>
          ))}
      </CardContent>
    </Card>
  );
}
