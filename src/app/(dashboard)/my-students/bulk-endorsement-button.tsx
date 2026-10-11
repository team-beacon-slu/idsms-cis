"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BulkResult {
  generated: string[];
  skipped: { studentProfileId: string; reason: string }[];
  failed: string[];
}

// FR-DG-02 + NFR-SEC-05: bulk letters for one class group, gated on
// re-entering the account password.
export function BulkEndorsementButton({
  classGroupId,
  classGroupName,
}: {
  classGroupId: string;
  classGroupName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      const res = await fetch(`/api/class-groups/${classGroupId}/endorsement-letters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Bulk generation failed");
        return;
      }
      setResult(body as BulkResult);
      toast.success(
        `Generated ${body.generated.length} · Skipped ${body.skipped.length} · Failed ${body.failed.length}`
      );
      router.refresh();
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setPassword("");
      setIsPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="cursor-pointer gap-1.5">
          <FileStack className="size-4" aria-hidden="true" />
          Generate endorsement letters
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk endorsement letters — {classGroupName}</DialogTitle>
          <DialogDescription>
            Generates a letter for every student whose 9 requirements are approved (up to 40 at a
            time). Re-enter your password to continue.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-2 text-sm">
            <p>
              Generated {result.generated.length} · Skipped {result.skipped.length} · Failed{" "}
              {result.failed.length}
            </p>
            {result.skipped.length > 0 && (
              <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-muted-foreground">
                {result.skipped.map((s) => (
                  <li key={s.studentProfileId}>{s.reason}</li>
                ))}
              </ul>
            )}
            {result.failed.length > 0 && (
              <p className="text-amber-700 dark:text-amber-400">
                Failed letters can be regenerated from each student&apos;s checklist page.
              </p>
            )}
          </div>
        ) : (
          <form id={`bulk-${classGroupId}`} onSubmit={onSubmit} className="space-y-2">
            <Label htmlFor={`bulk-password-${classGroupId}`}>Password</Label>
            <Input
              id={`bulk-password-${classGroupId}`}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
            />
          </form>
        )}
        <DialogFooter>
          {!result && (
            <Button
              type="submit"
              form={`bulk-${classGroupId}`}
              disabled={isPending || !password}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              {isPending ? "Generating..." : "Confirm and generate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
