"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileDown, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfStatus = "GENERATED" | "FAILED" | "PENDING_DRAFT" | null;

// Fired right after a successful submit. The submission is already saved, so
// any PDF problem is reported as a warning pointing at "Regenerate PDF" —
// never thrown, so it can't surface as an unhandled rejection.
export async function generatePdfInBackground(
  endpoint: string,
  onSettled: () => void
): Promise<void> {
  const warning = "Report saved, but its PDF could not be generated — use Regenerate PDF";
  try {
    const res = await fetch(endpoint, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.status === "FAILED") toast.error(warning);
  } catch {
    toast.error(warning);
  } finally {
    onSettled();
  }
}

// FR-DG-07 UI: Download when ready, Generate/Regenerate otherwise. `endpoint`
// is the document's /pdf route (GET downloads, POST generates), so the same
// component serves weekly and monthly reports.
export function ReportPdfActions({
  endpoint,
  status,
  canGenerate,
}: {
  endpoint: string;
  status: PdfStatus;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function generate() {
    setIsPending(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not generate the PDF");
      } else if (body.status === "FAILED") {
        toast.error("PDF generation failed after 3 retries — try Regenerate again shortly");
      } else {
        toast.success("PDF ready");
      }
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setIsPending(false);
      router.refresh();
    }
  }

  if (status === "GENERATED") {
    return (
      <a
        href={endpoint}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer gap-1.5")}
      >
        <FileDown className="size-3.5" aria-hidden="true" />
        Download PDF
      </a>
    );
  }

  if (!canGenerate) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={generate}
      className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
    >
      <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} aria-hidden="true" />
      {isPending ? "Generating..." : status === "FAILED" ? "Regenerate PDF" : "Generate PDF"}
    </Button>
  );
}
