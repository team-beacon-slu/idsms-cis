"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FullNameForm({
  initial,
  label = "Full name (as it should appear on your endorsement letter)",
}: {
  initial: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial ?? "");
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      const res = await fetch("/api/profile/full-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.issues?.[0]?.message ?? body.error ?? "Could not save your name");
        return;
      }
      toast.success("Name saved");
      router.refresh();
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-2">
        <Label htmlFor="full-name">{label}</Label>
        <Input
          id="full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          className="w-full sm:w-80"
        />
      </div>
      <Button type="submit" disabled={isPending} className="cursor-pointer">
        {isPending ? "Saving..." : "Save name"}
      </Button>
    </form>
  );
}
