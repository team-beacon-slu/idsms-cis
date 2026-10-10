"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheck2, Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SignedCopyUpload({
  weeklyReportId,
  hasSignedCopy,
  canUpload,
}: {
  weeklyReportId: string;
  hasSignedCopy: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, setIsPending] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    setIsPending(true);
    const res = await fetch(`/api/weekly-reports/${weeklyReportId}/signed-copy`, {
      method: "POST",
      body: form,
    });
    setIsPending(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Upload failed");
      return;
    }
    toast.success("Signed copy uploaded");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {hasSignedCopy && (
        <a
          href={`/api/weekly-reports/${weeklyReportId}/signed-copy`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "cursor-pointer gap-1.5"
          )}
        >
          <FileCheck2 className="size-3.5" aria-hidden="true" />
          Signed copy
        </a>
      )}
      {canUpload && (
        <label
          htmlFor={`signed-${weeklyReportId}`}
          title="PDF up to 5MB, or JPG/PNG up to 2MB"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "cursor-pointer gap-1.5",
            isPending && "pointer-events-none opacity-50"
          )}
        >
          <Upload className="size-3.5" aria-hidden="true" />
          {isPending
            ? "Uploading..."
            : hasSignedCopy
              ? "Replace signed copy"
              : "Upload signed copy"}
          <input
            id={`signed-${weeklyReportId}`}
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={onChange}
            disabled={isPending}
          />
        </label>
      )}
    </div>
  );
}
