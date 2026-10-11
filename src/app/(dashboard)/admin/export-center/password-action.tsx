"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Reusable inline "confirm with your password" step (NFR-SEC-05). Used by the
// Export Center cards and, later, DSAR exports and retention deletes. It is
// inline rather than window.confirm so it stays readable and keyboard-reachable.
export function PasswordAction({
  triggerLabel,
  confirmLabel,
  description,
  destructive = false,
  onConfirm,
}: {
  triggerLabel: string;
  confirmLabel: string;
  description?: string;
  destructive?: boolean;
  onConfirm: (password: string) => Promise<void>;
}) {
  const fieldId = useId();
  const descId = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  function close() {
    setOpen(false);
    setPassword("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !password) return;
    setPending(true);
    try {
      await onConfirm(password);
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setPassword("");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant={destructive ? "destructive" : "outline"}
        className="cursor-pointer"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) close();
      }}
      aria-label={triggerLabel}
      className="space-y-3"
    >
      {description && (
        <p id={descId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor={fieldId}>Your password</Label>
        <Input
          id={fieldId}
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          disabled={pending}
          aria-describedby={description ? descId : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          variant={destructive ? "destructive" : "default"}
          className="cursor-pointer"
          disabled={pending || !password}
        >
          {pending ? "Working…" : confirmLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="cursor-pointer"
          disabled={pending}
          onClick={close}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function filenameFromDisposition(header: string | null): string {
  const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!match) return "idsms-export.xlsx";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

// Saves a fetch Response body as a file via a temporary object URL.
export async function downloadFromResponse(res: Response): Promise<void> {
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
