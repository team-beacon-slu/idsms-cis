// Company days off, added by the coordinator for any host company: an anniversary, a company
// holiday (Chinese New Year, an Australian public holiday), a work suspension. Interns follow
// their own company's calendar, not the school's: a day off reaches only the interns placed at
// that company (the school's own suspensions only reach interns whose host company is the school).
// Stored as an ordinary company day (FR-AT-02), so interns and advisers also see and manage it
// on the attendance page. Coordinator / Super Admin only (enforced by the routes).
import { HolidayType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";

export class CalendarEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarEntryError";
  }
}

export const companyDaySchema = z.object({
  companyId: z.uuid("Pick a company"),
  date: z.iso.date(),
  name: z.string().trim().min(1, "Give the reason, e.g. Company anniversary").max(120),
});

// Upcoming and recent company days (last 30 days), so the list stays short.
export async function listCompanyDays(now: Date = new Date()) {
  return prisma.holidayCalendarEntry.findMany({
    where: {
      holidayType: HolidayType.COMPANY,
      companyId: { not: null },
      studentProfileId: null,
      date: { gte: new Date(now.getTime() - 30 * 86_400_000) },
    },
    orderBy: { date: "asc" },
    select: { id: true, date: true, name: true, company: { select: { name: true } } },
  });
}

export async function addCompanyDay(input: unknown, actingUserId: string): Promise<{ id: string }> {
  const { companyId, date, name } = companyDaySchema.parse(input);
  const day = new Date(`${date}T00:00:00.000Z`);
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { name: true },
    });
    if (!company) throw new CalendarEntryError("That company no longer exists");
    const clash = await tx.holidayCalendarEntry.findFirst({
      where: { companyId, date: day, studentProfileId: null },
      select: { name: true },
    });
    if (clash) throw new CalendarEntryError(`${company.name} already has a day off on ${date}`);
    const created = await tx.holidayCalendarEntry.create({
      data: {
        date: day,
        name,
        holidayType: HolidayType.COMPANY,
        companyId,
        createdById: actingUserId,
      },
      select: { id: true },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "COMPANY_HOLIDAY_ADDED",
        entityType: "HolidayCalendarEntry",
        entityId: created.id,
        detail: { companyId, name, date },
      },
      tx
    );
    return created;
  });
}

export async function removeCompanyDay(id: string, actingUserId: string): Promise<void> {
  const day = await prisma.holidayCalendarEntry.findFirst({
    where: { id, holidayType: HolidayType.COMPANY, studentProfileId: null },
    select: { id: true, date: true, name: true, companyId: true },
  });
  if (!day?.companyId) throw new CalendarEntryError("That day off no longer exists");
  await prisma.$transaction(async (tx) => {
    // Interns' "doesn't apply to me" markers for this day go with it.
    await tx.holidayCalendarEntry.deleteMany({
      where: {
        date: day.date,
        holidayType: HolidayType.COMPANY,
        studentProfile: { companyId: day.companyId },
      },
    });
    await tx.holidayCalendarEntry.delete({ where: { id: day.id } });
    await logEvent(
      {
        userId: actingUserId,
        action: "COMPANY_HOLIDAY_REMOVED",
        entityType: "HolidayCalendarEntry",
        entityId: day.id,
        detail: { companyId: day.companyId, name: day.name },
      },
      tx
    );
  });
}
