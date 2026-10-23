import { requireUserPage } from "@/lib/auth/session";
import { listNotifications } from "@/lib/services/inbox";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationList, type InboxItem } from "./notification-list";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Notifications" };

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
      <PageHeader
        title="Notifications"
        description="Review outcomes, deadlines, and account updates."
      />
      <Card>
        <CardContent className="p-5">
          <NotificationList items={inbox} />
        </CardContent>
      </Card>
    </div>
  );
}
