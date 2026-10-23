"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PasswordAction } from "./password-action";

// Per-file actions in the retention review list. Keeping changes nothing in
// storage, so it needs no password; permanent deletion re-authenticates
// (NFR-SEC-05).
export function RetentionActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function keep() {
    setPending(true);
    try {
      const res = await fetch(`/api/admin/retention/${id}/keep`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not keep the file");
      }
      toast.success("File kept. It will not be flagged again.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not keep the file");
    } finally {
      setPending(false);
    }
  }

  async function deletePermanently(password: string) {
    const res = await fetch(`/api/admin/retention/${id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Could not delete the file");
    }
    toast.success("File deleted permanently");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="cursor-pointer"
        disabled={pending}
        onClick={keep}
        aria-label={`Keep ${label}`}
      >
        {pending ? "Saving…" : "Keep"}
      </Button>
      <PasswordAction
        triggerLabel="Delete permanently"
        confirmLabel="Delete permanently"
        description="This permanently removes the file from storage. The record stays and the deletion is logged."
        destructive
        onConfirm={deletePermanently}
      />
    </div>
  );
}
