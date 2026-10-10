"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileDown, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfStatus = "GENERATED" | "FAILED" | "PENDING_DRAFT" | null;

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
    const res = await fetch(endpoint, { method: "POST" });
    setIsPending(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Could not generate the PDF");
    } else if (body.status === "FAILED") {
      toast.error("PDF generation failed after 3 retries — try Regenerate again shortly");
    } else {
      toast.success("PDF ready");
    }
    router.refresh();
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
