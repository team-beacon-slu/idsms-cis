"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

// FR-NT-03: unread badge in the app chrome. A link to the inbox rather than a
// hover/popover menu, so it works the same with keyboard, touch, and mouse.
export function NotificationBell({ className }: { className?: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && typeof body?.unreadCount === "number") setUnread(body.unreadCount);
      })
      .catch(() => {}); // the badge is best-effort; the inbox page shows errors
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className={cn(
        "relative inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        className
      )}
    >
      <Bell className="size-5" aria-hidden="true" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-semibold text-white"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
