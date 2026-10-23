"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MonitorX } from "lucide-react";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";

export function SignOutOthersButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const res = await sendJson("/api/profile/sessions", { method: "DELETE" });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const n = Number(res.body.signedOut ?? 0);
    toast.success(n === 1 ? "Signed out of 1 other device" : `Signed out of ${n} other devices`);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      className="cursor-pointer gap-1.5"
    >
      <MonitorX className="size-4" aria-hidden="true" />
      {pending ? "Signing out..." : "Sign out of other devices"}
    </Button>
  );
}
