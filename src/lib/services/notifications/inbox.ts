import { NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function listNotifications(userId: string, { limit = 20 }: { limit?: number } = {}) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, channel: NotificationChannel.IN_APP },
      orderBy: { sentAt: "desc" },
      take: limit,
      select: { id: true, triggerType: true, payload: true, sentAt: true, readAt: true },
    }),
    prisma.notification.count({
      where: { userId, channel: NotificationChannel.IN_APP, readAt: null },
    }),
  ]);
  return { items, unreadCount };
}

// updateMany scoped by userId: a foreign id simply matches 0 rows (→ 404),
// so ownership is enforced by the query itself.
export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return count > 0;
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, channel: NotificationChannel.IN_APP, readAt: null },
    data: { readAt: new Date() },
  });
}
