"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

type Intern = { id: string; name: string };

// Batch print: the approved Weekly Work Reports of the chosen interns as one PDF file, saved
// to open and print. A download, not a new tab: the app's CSP (object-src 'none') carries over
// to a blob: tab and can blank Chrome's PDF viewer. With one intern there is nothing to choose.
export function BatchPrintButton({ interns }: { interns: Intern[] }) {
  // Starts empty: a whole class (43 interns, 130 weeks in the beta) is over the 60-report limit.
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  async function print(ids: string[]) {
    setPending(true);
    try {
      const res = await fetch("/api/weekly-reports/batch-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentProfileIds: ids }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Could not prepare the PDF. Try fewer interns.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "Weekly Work Reports.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("PDF saved. Open it to print.");
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const label = pending ? "Preparing PDF..." : "Print approved weekly reports";
  if (interns.length <= 1) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={pending || interns.length === 0}
        onClick={() => print(interns.map((i) => i.id))}
        className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
      >
        <Printer className="size-4" aria-hidden="true" />
        {label}
      </Button>
    );
  }

  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all = chosen.size === interns.length;

  return (
    <details className="relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted">
        <Printer className="size-4" aria-hidden="true" />
        Batch print
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-lg border bg-card p-3 shadow-md">
        <p className="text-xs text-muted-foreground">
          Approved and regarded weekly reports, one PDF, each week on a new page.
        </p>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={all}
            onChange={() => setChosen(all ? new Set() : new Set(interns.map((i) => i.id)))}
            className="size-4 accent-primary"
          />
          All interns ({interns.length})
        </label>
        <ul className="max-h-60 space-y-1 overflow-y-auto border-t pt-2">
          {interns.map((i) => (
            <li key={i.id}>
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.has(i.id)}
                  onChange={() => toggle(i.id)}
                  className="size-4 accent-primary"
                />
                {i.name}
              </label>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          disabled={pending || chosen.size === 0}
          onClick={() => print([...chosen])}
          className="w-full cursor-pointer gap-1.5 disabled:cursor-not-allowed"
        >
          <Printer className="size-3.5" aria-hidden="true" />
          {pending ? "Preparing PDF..." : `Print (${chosen.size})`}
        </Button>
      </div>
    </details>
  );
}
