"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadFromResponse, PasswordAction } from "./password-action";

// Per-request actions in the DSAR queue. The export re-authenticates
// (NFR-SEC-05); marking fulfilled is a state change, not an export, so it
// needs no password, only an inline confirm because it notifies the requester.
export function DataRequestActions({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  // Focus follows the swap: Confirm on reveal, the trigger when it returns.
  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  function closeConfirm() {
    restoreFocus.current = true;
    setConfirming(false);
  }

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
      closeConfirm();
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
      {confirming ? (
        <div
          role="group"
          aria-label={`Confirm fulfilled for ${email}`}
          className="flex flex-col gap-2"
        >
          <p className="text-sm">
            Mark this request fulfilled? The requester will be told their data is ready.
          </p>
          <div className="flex gap-2">
            <Button
              ref={confirmRef}
              type="button"
              size="sm"
              disabled={pending}
              onClick={markFulfilled}
            >
              {pending ? "Saving…" : "Confirm"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={closeConfirm}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirming(true)}
          aria-label={`Mark fulfilled for ${email}`}
        >
          Mark fulfilled
        </Button>
      )}
    </div>
  );
}
