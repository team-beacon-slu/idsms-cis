"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserCheck, UserX, LogOut, Unlock } from "lucide-react";
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
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        className="cursor-pointer gap-1.5"
        disabled={disabled || isPending}
        onClick={toggleActive}
      >
        {isActive ? (
          <UserX className="size-3.5" aria-hidden="true" />
        ) : (
          <UserCheck className="size-3.5" aria-hidden="true" />
        )}
        {isActive ? "Deactivate" : "Activate"}
      </Button>
      {canSuperAdmin && (
        <Button
          size="sm"
          variant="outline"
          className="cursor-pointer gap-1.5"
          disabled={disabled || isPending}
          onClick={forceLogout}
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          Force logout
        </Button>
      )}
      {canSuperAdmin && isLocked && (
        <Button
          size="sm"
          variant="outline"
          className="cursor-pointer gap-1.5"
          disabled={isPending}
          onClick={unlock}
        >
          <Unlock className="size-3.5" aria-hidden="true" />
          Unlock
        </Button>
      )}
    </div>
  );
}
