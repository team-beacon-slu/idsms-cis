"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CompanyVerifyToggle({
  companyId,
  isVerified,
}: {
  companyId: string;
  isVerified: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function toggle() {
    setIsPending(true);
    const res = await sendJson(`/api/companies/${companyId}`, {
      method: "PATCH",
      body: { isVerified: !isVerified },
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(isVerified ? "Company unverified" : "Company verified");
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="cursor-pointer gap-1.5"
      disabled={isPending}
      onClick={toggle}
    >
      {isVerified ? (
        <ShieldOff className="size-3.5" aria-hidden="true" />
      ) : (
        <ShieldCheck className="size-3.5" aria-hidden="true" />
      )}
      {isPending ? "Saving..." : isVerified ? "Unverify" : "Verify"}
    </Button>
  );
}
