import { Bell } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { listNotifications } from "@/lib/services/inbox";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationList, type InboxItem } from "./notification-list";

function field(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export default async function NotificationsPage() {
  const user = await requireUserPage();
  const { items } = await listNotifications(user.id, { limit: 50 });
  const inbox: InboxItem[] = items.map((n) => ({
    id: n.id,
    title: field(n.payload, "title") ?? n.triggerType,
    body: field(n.payload, "body") ?? "",
    link: field(n.payload, "link"),
    sentAt: n.sentAt?.toISOString() ?? null,
    read: n.readAt !== null,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Bell className="size-6 text-primary" aria-hidden="true" />
          Notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review outcomes, deadlines, and account updates (FR-NT-01).
        </p>
      </div>
      <Card>
        <CardContent className="p-5">
          <NotificationList items={inbox} />
        </CardContent>
      </Card>
    </div>
  );
}
