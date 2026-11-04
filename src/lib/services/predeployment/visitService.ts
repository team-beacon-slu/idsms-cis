// SAMCIS's company visit before the internship ends (SLU Internship Program guidelines,
// IV.2.d), recorded by the faculty adviser or coordinator on the company's page (025).
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { ForbiddenError } from "@/lib/services/accounts/userService";

export const VISITORS: Role[] = [
  Role.FACULTY_ADVISER,
  Role.DEPARTMENT_COORDINATOR,
  Role.SUPER_ADMIN,
];

export const visitSchema = z.object({
  visitedOn: z.iso.date().transform((d) => new Date(`${d}T00:00:00.000Z`)),
  mode: z.enum(["ON_SITE", "ONLINE"]).default("ON_SITE"),
  notes: z.string().trim().max(4000).optional(),
});

export async function recordVisit(
  companyId: string,
  input: unknown,
  actingUser: { id: string; role: Role },
  ip?: string | null
) {
  if (!VISITORS.includes(actingUser.role)) throw new ForbiddenError();
  const { visitedOn, mode, notes } = visitSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const visit = await tx.companyVisit.create({
      data: { companyId, visitedOn, mode, notes: notes || null, visitedBy: actingUser.id },
      select: { id: true },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: "COMPANY_VISITED",
        entityType: "Company",
        entityId: companyId,
        ipAddress: ip,
      },
      tx
    );
    return visit;
  });
}

export async function listVisits(companyId: string) {
  return prisma.companyVisit.findMany({
    where: { companyId },
    orderBy: { visitedOn: "desc" },
    include: { visitor: { select: { fullName: true, email: true } } },
  });
}
