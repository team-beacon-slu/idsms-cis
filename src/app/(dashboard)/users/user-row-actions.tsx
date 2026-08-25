"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface UserRowActionsProps {
  userId: string;
  isActive: boolean;
  isLocked: boolean;
  disabled: boolean;
  canSuperAdmin: boolean;
}

export function UserRowActions({
  userId,
  isActive,
  isLocked,
  disabled,
  canSuperAdmin,
}: UserRowActionsProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function toggleActive() {
    setIsPending(true);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error("Failed to update user");
      return;
    }
    toast.success(isActive ? "User deactivated" : "User activated");
    router.refresh();
  }

  async function forceLogout() {
    setIsPending(true);
    const res = await fetch(`/api/users/${userId}/force-logout`, { method: "POST" });
    setIsPending(false);
    if (!res.ok) {
      toast.error("Failed to force logout");
      return;
    }
    toast.success("User signed out of all sessions");
  }

  async function unlock() {
    setIsPending(true);
    const res = await fetch(`/api/users/${userId}/unlock`, { method: "POST" });
    setIsPending(false);
    if (!res.ok) {
      toast.error("Failed to unlock account");
      return;
    }
    toast.success("Account unlocked");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={disabled || isPending} onClick={toggleActive}>
        {isActive ? "Deactivate" : "Activate"}
      </Button>
      {canSuperAdmin && (
        <Button size="sm" variant="outline" disabled={disabled || isPending} onClick={forceLogout}>
          Force logout
        </Button>
      )}
      {canSuperAdmin && isLocked && (
        <Button size="sm" variant="outline" disabled={isPending} onClick={unlock}>
          Unlock
        </Button>
      )}
    </div>
  );
}
