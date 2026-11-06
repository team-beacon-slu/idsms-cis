// Coordinator-posted department events (orientation, seminars, ...). They appear on every
// intern's, adviser's and the coordinator's calendar for the active semester. Informational only:
// not a day off. Coordinator / Super Admin only (enforced by the routes).
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { CalendarEntryError } from "@/lib/services/calendar/companyDaysService";

export const departmentEventSchema = z.object({
  date: z.iso.date(),
  name: z.string().trim().min(1, "Name the event, e.g. Pre-deployment orientation").max(120),
});

export async function listDepartmentEvents() {
  return prisma.departmentEvent.findMany({
    where: { semester: { isActive: true } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, title: true },
  });
}

export async function addDepartmentEvent(
  input: unknown,
  actingUserId: string
): Promise<{ id: string }> {
  const { date, name } = departmentEventSchema.parse(input);
  const semester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  // No events without a semester to show them in.
  if (!semester) throw new CalendarEntryError("Set an active semester first");
  return prisma.$transaction(async (tx) => {
    const created = await tx.departmentEvent.create({
      data: {
        semesterId: semester.id,
        date: new Date(`${date}T00:00:00.000Z`),
        title: name,
        createdById: actingUserId,
      },
      select: { id: true },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "DEPARTMENT_EVENT_ADDED",
        entityType: "DepartmentEvent",
        entityId: created.id,
        detail: { date, title: name },
      },
      tx
    );
    return created;
  });
}

export async function removeDepartmentEvent(id: string, actingUserId: string): Promise<void> {
  const event = await prisma.departmentEvent.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!event) throw new CalendarEntryError("That event no longer exists");
  await prisma.$transaction(async (tx) => {
    await tx.departmentEvent.delete({ where: { id } });
    await logEvent(
      {
        userId: actingUserId,
        action: "DEPARTMENT_EVENT_REMOVED",
        entityType: "DepartmentEvent",
        entityId: id,
        detail: { title: event.title },
      },
      tx
    );
  });
}
