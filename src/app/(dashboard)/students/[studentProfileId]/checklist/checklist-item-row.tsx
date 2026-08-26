"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Eye, RotateCcw, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Items 8 (WORK_PLAN) and 9 (MOA) mirror the status of a separate record
// (the student's WorkPlan / the company's MoaRecord) — Faculty still
// explicitly approves them, but there's no file to upload for either.
const NO_UPLOAD_TYPES = new Set(["WORK_PLAN", "MOA"]);

interface ChecklistItemRowProps {
  itemId: string;
  requirementType: string;
  status: string;
  hasFile: boolean;
  canUpload: boolean;
  canReview: boolean;
}

export function ChecklistItemRow({
  itemId,
  requirementType,
  status,
  hasFile,
  canUpload,
  canReview,
}: ChecklistItemRowProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsPending(true);
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch(`/api/checklist-items/${itemId}/upload`, {
      method: "POST",
      body: formData,
    });
    setIsPending(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!res.ok) {
      const body = await res.json();
      toast.error(body.error ?? "Upload failed");
      return;
    }
    toast.success("File uploaded");
    router.refresh();
  }

  async function viewFile() {
    const res = await fetch(`/api/checklist-items/${itemId}/file`);
    if (!res.ok) {
      toast.error("Failed to load file");
      return;
    }
    const { url } = await res.json();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function review(action: "APPROVE" | "RETURN") {
    setIsPending(true);
    const res = await fetch(`/api/checklist-items/${itemId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setIsPending(false);

    if (!res.ok) {
      const body = await res.json();
      toast.error(body.error ?? "Review failed");
      return;
    }
    toast.success(action === "APPROVE" ? "Approved" : "Returned");
    router.refresh();
  }

  const canUploadThisItem =
    canUpload && !NO_UPLOAD_TYPES.has(requirementType) && status !== "APPROVED";
  const isAutoTracked = canUpload && NO_UPLOAD_TYPES.has(requirementType) && status !== "APPROVED";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isAutoTracked && (
        <span className="text-xs text-muted-foreground">Tracked automatically</span>
      )}

      {hasFile && (
        <Button size="sm" variant="outline" onClick={viewFile} className="cursor-pointer gap-1.5">
          <Eye className="size-3.5" aria-hidden="true" />
          View file
        </Button>
      )}

      {canUploadThisItem && (
        <div className="flex items-center gap-1.5">
          <label
            htmlFor={`checklist-file-${itemId}`}
            title="Accepts PDF, JPG, or PNG"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "cursor-pointer gap-1.5 transition-colors duration-200",
              isPending && "pointer-events-none opacity-50"
            )}
          >
            <Upload className="size-3.5" aria-hidden="true" />
            {isPending ? "Uploading..." : hasFile ? "Replace file" : "Upload file"}
          </label>
          <input
            id={`checklist-file-${itemId}`}
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={handleFileChange}
            disabled={isPending}
            className="sr-only"
          />
        </div>
      )}

      {canReview && status !== "APPROVED" && (
        <>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => review("APPROVE")}
            className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {isPending ? "Saving..." : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => review("RETURN")}
            className={cn(
              "cursor-pointer gap-1.5 border-red-200 text-red-700 transition-colors duration-200 hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed",
              "dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            )}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {isPending ? "Saving..." : "Return"}
          </Button>
        </>
      )}
    </div>
  );
}
