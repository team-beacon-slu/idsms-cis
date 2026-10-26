"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// The coordinator records what the company said back about intern feedback (CMO 104).
export function CompanyReplyForm({ companyId, current }: { companyId: string; current: string }) {
  const router = useRouter();
  const [reply, setReply] = useState(current);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const res = await sendJson(`/api/companies/${companyId}/reply`, {
      method: "PUT",
      body: { reply },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Company reply saved");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="company-reply">Company&apos;s reply</Label>
      <Textarea
        id="company-reply"
        rows={3}
        maxLength={2000}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="What the company said about this feedback, and what it will change"
      />
      <Button
        size="sm"
        disabled={pending || reply.trim().length < 10 || reply === current}
        onClick={save}
        className="cursor-pointer"
      >
        {pending ? "Saving…" : "Save reply"}
      </Button>
    </div>
  );
}
