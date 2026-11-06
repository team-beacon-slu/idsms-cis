// NFR-REL-01: a Super Admin announces planned downtime (or anything everyone must see) in one
// banner across every signed-in page. Stored in system_config; an empty message clears it.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { requestCache } from "@/lib/utils/requestCache";

export const MAINTENANCE_NOTICE_KEY = "maintenance_notice";

export const maintenanceNoticeSchema = z.object({
  message: z.string().trim().max(300, "Keep the notice under 300 characters"),
});

export const getMaintenanceNotice = requestCache(async (): Promise<string | null> => {
  const row = await prisma.systemConfig.findUnique({
    where: { configKey: MAINTENANCE_NOTICE_KEY },
    select: { configValue: true },
  });
  const parsed = maintenanceNoticeSchema.safeParse(row?.configValue);
  return parsed.success && parsed.data.message ? parsed.data.message : null;
});

export async function setMaintenanceNotice(
  input: unknown,
  actingUserId: string
): Promise<{ message: string }> {
  const { message } = maintenanceNoticeSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const config = await tx.systemConfig.upsert({
      where: { configKey: MAINTENANCE_NOTICE_KEY },
      create: {
        configKey: MAINTENANCE_NOTICE_KEY,
        configValue: { message },
        updatedBy: actingUserId,
      },
      update: { configValue: { message }, updatedBy: actingUserId },
      select: { id: true },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: message ? "MAINTENANCE_NOTICE_SET" : "MAINTENANCE_NOTICE_CLEARED",
        entityType: "SystemConfig",
        entityId: config.id,
        detail: { message },
      },
      tx
    );
    return { message };
  });
}
