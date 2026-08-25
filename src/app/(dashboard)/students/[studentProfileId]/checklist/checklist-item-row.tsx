"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasFile && (
        <Button size="sm" variant="outline" onClick={viewFile}>
          View file
        </Button>
      )}
      {canUploadThisItem && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={handleFileChange}
            disabled={isPending}
            className="text-sm"
          />
        </>
      )}
      {canReview && status !== "APPROVED" && (
        <>
          <Button size="sm" disabled={isPending} onClick={() => review("APPROVE")}>
            {isPending ? "Saving..." : "Approve"}
          </Button>
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => review("RETURN")}>
            {isPending ? "Saving..." : "Return"}
          </Button>
        </>
      )}
    </div>
  );
}
