"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Action = "activate" | "archive";

// Activate runs straight away; Archive asks first with an inline step (not
// window.confirm) so the consequence is readable and keyboard-reachable.
export function SemesterActions({
  semesterId,
  name,
  isActive,
}: {
  semesterId: string;
  name: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  async function run(action: Action) {
    setPending(action);
    try {
      const res = await fetch(`/api/semesters/${semesterId}/${action}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not update the semester");
        return;
      }
      toast.success(
        action === "activate" ? `${name} is now the active semester` : `${name} archived`
      );
      setConfirmingArchive(false);
      router.refresh();
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setPending(null);
    }
  }

  if (confirmingArchive) {
    return (
      <div role="group" aria-label={`Confirm archiving ${name}`} className="max-w-xs space-y-2">
        <p className="text-sm text-foreground">
          Archive {name}? Archiving keeps all records and hides the semester from default views.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="destructive"
            className="cursor-pointer"
            disabled={pending !== null}
            onClick={() => run("archive")}
          >
            {pending === "archive" ? "Archiving…" : "Archive semester"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer"
            autoFocus
            disabled={pending !== null}
            onClick={() => setConfirmingArchive(false)}
          >
            Keep semester
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {!isActive && (
        <Button
          size="sm"
          variant="outline"
          className="cursor-pointer"
          disabled={pending !== null}
          aria-label={`Activate ${name}`}
          onClick={() => run("activate")}
        >
          {pending === "activate" ? "Activating…" : "Activate"}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="cursor-pointer"
        disabled={pending !== null}
        aria-label={`Archive ${name}`}
        onClick={() => setConfirmingArchive(true)}
      >
        Archive
      </Button>
    </div>
  );
}
