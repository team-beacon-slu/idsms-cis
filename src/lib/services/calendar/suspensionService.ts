// Q14 option B: University suspension days (weather, etc.). Semester-wide like PH holidays, so
// they reach every intern's calendar and weekly report and count as a holiday, with the same
// per-intern "doesn't apply to me" opt-out. Coordinator / Super Admin only (enforced by routes).
import { HolidayType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";

export class SuspensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuspensionError";
  }
}

export const suspensionSchema = z.object({
  date: z.iso.date(),
  name: z.string().trim().min(1, "Give a reason, e.g. Typhoon signal no. 2").max(120),
});

async function activeSemesterId(): Promise<string> {
  const semester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!semester) throw new SuspensionError("Set an active semester first");
  return semester.id;
}

export async function listSuspensionDays() {
  const semester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!semester) return [];
  return prisma.holidayCalendarEntry.findMany({
    where: { semesterId: semester.id, holidayType: HolidayType.SUSPENSION, studentProfileId: null },
    orderBy: { date: "asc" },
    select: { id: true, date: true, name: true },
  });
}

export async function addSuspensionDay(
  input: unknown,
  actingUserId: string
): Promise<{ id: string }> {
  const { date, name } = suspensionSchema.parse(input);
  const semesterId = await activeSemesterId();
  const day = new Date(`${date}T00:00:00.000Z`);
  return prisma.$transaction(async (tx) => {
    const clash = await tx.holidayCalendarEntry.findFirst({
      where: { semesterId, date: day, studentProfileId: null },
      select: { name: true },
    });
    if (clash) throw new SuspensionError(`${date} is already a day off (${clash.name})`);
    const created = await tx.holidayCalendarEntry.create({
      data: {
        date: day,
        name,
        holidayType: HolidayType.SUSPENSION,
        semesterId,
        createdById: actingUserId,
      },
      select: { id: true },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "SUSPENSION_DAY_ADDED",
        entityType: "HolidayCalendarEntry",
        entityId: created.id,
        detail: { date, name },
      },
      tx
    );
    return created;
  });
}

export async function removeSuspensionDay(id: string, actingUserId: string): Promise<void> {
  const day = await prisma.holidayCalendarEntry.findFirst({
    where: { id, holidayType: HolidayType.SUSPENSION, studentProfileId: null },
    select: { id: true, date: true, name: true, semesterId: true },
  });
  if (!day) throw new SuspensionError("That suspension day no longer exists");
  await prisma.$transaction(async (tx) => {
    // Interns' "doesn't apply to me" markers for this day go with it.
    await tx.holidayCalendarEntry.deleteMany({
      where: {
        date: day.date,
        holidayType: HolidayType.SUSPENSION,
        studentProfile: { semesterId: day.semesterId ?? undefined },
      },
    });
    await tx.holidayCalendarEntry.delete({ where: { id: day.id } });
    await logEvent(
      {
        userId: actingUserId,
        action: "SUSPENSION_DAY_REMOVED",
        entityType: "HolidayCalendarEntry",
        entityId: day.id,
        detail: { name: day.name, date: day.date.toISOString().slice(0, 10) },
      },
      tx
    );
  });
}
