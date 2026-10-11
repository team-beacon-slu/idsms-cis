"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { safeInternalPath } from "@/lib/utils/safeInternalPath";

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  sentAt: string | null;
  read: boolean;
}

export function NotificationList({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function open(item: InboxItem) {
    if (!item.read) {
      // Still follow the link on failure — but say so, or the item would
      // silently stay unread.
      const res = await fetch(`/api/notifications/${item.id}/read`, { method: "PATCH" }).catch(
        () => null
      );
      if (!res?.ok) toast.error("Could not mark this notification as read");
    }
    const target = safeInternalPath(item.link);
    if (target) router.push(target);
    else router.refresh();
  }

  async function markAll() {
    setPending(true);
    try {
      const res = await fetch("/api/notifications", { method: "PATCH" });
      if (!res.ok) toast.error("Could not mark notifications as read");
      router.refresh();
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setPending(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No notifications yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={markAll}
          disabled={pending || items.every((i) => i.read)}
          className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          Mark all read
        </Button>
      </div>
      <ul className="divide-y rounded-lg border">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => open(item)}
              className={cn(
                "flex w-full cursor-pointer flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                !item.read && "bg-primary/5"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                {!item.read && (
                  <span className="size-2 rounded-full bg-primary" aria-label="Unread" />
                )}
                {item.title}
              </span>
              {item.body && <span className="text-sm text-muted-foreground">{item.body}</span>}
              {item.sentAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(item.sentAt).toLocaleString("en-PH", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "Asia/Manila",
                  })}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
