"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isVerified: !isVerified }),
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error("Failed to update verification status");
      return;
    }
    toast.success(isVerified ? "Company unverified" : "Company verified");
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={toggle}>
      {isVerified ? "Unverify" : "Verify"}
    </Button>
  );
}
