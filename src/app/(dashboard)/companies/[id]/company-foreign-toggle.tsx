"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe2 } from "lucide-react";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";

// An HTE outside the Philippines needs a proof of legitimacy instead of DTI and SEC (SAMCIS advisory).
export function CompanyForeignToggle({
  companyId,
  isForeign,
}: {
  companyId: string;
  isForeign: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const res = await sendJson(`/api/companies/${companyId}`, {
      method: "PATCH",
      body: { isForeign: !isForeign },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(isForeign ? "Marked as in the Philippines" : "Marked as outside the Philippines");
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={toggle}
      className="cursor-pointer gap-1.5"
    >
      <Globe2 className="size-3.5" aria-hidden="true" />
      {pending
        ? "Saving..."
        : isForeign
          ? "Mark as in the Philippines"
          : "Mark as outside the Philippines"}
    </Button>
  );
}
