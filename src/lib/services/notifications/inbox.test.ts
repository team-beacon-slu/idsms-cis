import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  listNotifications,
  markAllRead,
  markNotificationRead,
} from "@/lib/services/notifications/inbox";

beforeEach(() => resetPrismaMock());

it("lists the user's IN_APP notifications with an unread count", async () => {
  prismaMock.notification.findMany.mockResolvedValue([{ id: "n-1" }] as never);
  prismaMock.notification.count.mockResolvedValue(3);
  await expect(listNotifications("u-1")).resolves.toEqual({
    items: [{ id: "n-1" }],
    unreadCount: 3,
  });
  expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: "u-1", channel: "IN_APP" },
      orderBy: { sentAt: "desc" },
      take: 20,
    })
  );
});

it("cannot mark someone else's notification", async () => {
  prismaMock.notification.updateMany.mockResolvedValue({ count: 0 } as never);
  await expect(markNotificationRead("u-1", "n-other")).resolves.toBe(false);
  expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
    where: { id: "n-other", userId: "u-1", readAt: null },
    data: { readAt: expect.any(Date) },
  });
});

it("markAllRead only touches the caller's unread rows", async () => {
  prismaMock.notification.updateMany.mockResolvedValue({ count: 2 } as never);
  await markAllRead("u-1");
  expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
    where: { userId: "u-1", channel: "IN_APP", readAt: null },
    data: { readAt: expect.any(Date) },
  });
});
