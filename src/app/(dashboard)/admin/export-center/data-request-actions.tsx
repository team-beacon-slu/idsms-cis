"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadFromResponse, PasswordAction } from "./password-action";

// Per-request actions in the DSAR queue. The export re-authenticates
// (NFR-SEC-05); marking fulfilled is a state change, not an export, so it
// needs no password.
export function DataRequestActions({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function generateExport(password: string) {
    const res = await fetch(`/api/admin/data-requests/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Export failed");
    }
    await downloadFromResponse(res);
    toast.success(`Export for ${email} downloaded`);
    router.refresh();
  }

  async function markFulfilled() {
    setPending(true);
    try {
      const res = await fetch(`/api/admin/data-requests/${id}/fulfil`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not mark the request fulfilled");
      }
      toast.success(`Request from ${email} marked fulfilled`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark the request fulfilled");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <PasswordAction
        triggerLabel="Generate export"
        confirmLabel="Confirm and download"
        description={`Enter your password to download the data export for ${email}.`}
        onConfirm={generateExport}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={markFulfilled}
        aria-label={`Mark request from ${email} fulfilled`}
      >
        {pending ? "Saving…" : "Mark fulfilled"}
      </Button>
    </div>
  );
}
