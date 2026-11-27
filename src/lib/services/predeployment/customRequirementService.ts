// Checklist requirements the coordinator or Super Admin adds beyond the built-in types
// (panel revisions, Nov 2026). Each intern of a matching program gets a CUSTOM checklist
// row for it. Retiring takes it out of the endorsement gate but keeps every row, so an
// approved item stays in the intern's history. Roles are enforced by the routes.
import { ChecklistRequirementType, Prisma, PrismaClient, Program } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";

export class CustomRequirementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomRequirementError";
  }
}

// The fixed types with their own rules; CUSTOM is only the marker for added requirements.
export const BUILT_IN_CHECKLIST_TYPES: ChecklistRequirementType[] = Object.values(
  ChecklistRequirementType
).filter((t) => t !== ChecklistRequirementType.CUSTOM);

type Client = PrismaClient | Prisma.TransactionClient;
type Custom = { id: string; programs: Program[]; required: boolean; active: boolean };

const appliesTo = (c: Pick<Custom, "programs">, program: Program) =>
  c.programs.length === 0 || c.programs.includes(program);

// Pure: the custom requirements that gate an intern of this program's endorsement letter.
// Required custom requirements for one intern. Only those the intern has a checklist row for
// count toward the gate: without a row there is nothing to approve, and the intern would be
// blocked for good (rows are added for the active semester's interns and on import).
export function requiredCustomIds(
  customs: Custom[],
  program: Program,
  ownRows: Iterable<string | null>
): string[] {
  const own = new Set(ownRows);
  return customs
    .filter((c) => c.active && c.required && appliesTo(c, program) && own.has(c.id))
    .map((c) => c.id);
}

export function loadActiveCustomRequirements(client: Client = prisma): Promise<Custom[]> {
  return client.checklistCustomRequirement.findMany({
    where: { active: true },
    select: { id: true, programs: true, required: true, active: true },
  });
}

// Checklist rows a newly imported intern gets for the active custom requirements.
export async function customChecklistRows(
  studentProfileId: string,
  program: Program,
  client: Client
): Promise<Prisma.PreDeploymentChecklistItemCreateManyInput[]> {
  const customs = await loadActiveCustomRequirements(client);
  return customs
    .filter((c) => appliesTo(c, program))
    .map((c) => ({
      studentProfileId,
      requirementType: ChecklistRequirementType.CUSTOM,
      customRequirementId: c.id,
    }));
}

export function listCustomRequirements() {
  return prisma.checklistCustomRequirement.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      programs: true,
      required: true,
      active: true,
    },
  });
}

export const customRequirementSchema = z.object({
  name: z.string().trim().min(3, "Name the requirement, e.g. Vaccination card").max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((d) => d || null),
  programs: z.array(z.enum(Program)).max(Object.values(Program).length).default([]),
  required: z.boolean().default(true),
});

export async function addCustomRequirement(
  input: unknown,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ id: string; itemsCreated: number }> {
  const data = customRequirementSchema.parse(input);
  const programs = [...new Set(data.programs)];
  return prisma.$transaction(async (tx) => {
    const created = await tx.checklistCustomRequirement.create({
      data: { ...data, programs, createdById: actingUserId },
      select: { id: true },
    });
    // Current interns get the item now; later imports get it in createStudentProfile.
    const interns = await tx.studentProfile.findMany({
      where: {
        deletedAt: null,
        semester: { isActive: true },
        ...(programs.length > 0 && { program: { in: programs } }),
      },
      select: { id: true },
    });
    const { count } = await tx.preDeploymentChecklistItem.createMany({
      data: interns.map((p) => ({
        studentProfileId: p.id,
        requirementType: ChecklistRequirementType.CUSTOM,
        customRequirementId: created.id,
      })),
      skipDuplicates: true,
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "CHECKLIST_REQUIREMENT_ADDED",
        entityType: "ChecklistCustomRequirement",
        entityId: created.id,
        ipAddress,
        detail: { name: data.name, programs, required: data.required, itemsCreated: count },
      },
      tx
    );
    return { id: created.id, itemsCreated: count };
  });
}

export async function retireCustomRequirement(
  id: string,
  actingUserId: string,
  ipAddress?: string | null
): Promise<void> {
  const existing = await prisma.checklistCustomRequirement.findUnique({
    where: { id },
    select: { name: true, active: true },
  });
  if (!existing) throw new CustomRequirementError("That requirement no longer exists");
  if (!existing.active) throw new CustomRequirementError("That requirement is already retired");
  await prisma.$transaction(async (tx) => {
    await tx.checklistCustomRequirement.update({ where: { id }, data: { active: false } });
    await logEvent(
      {
        userId: actingUserId,
        action: "CHECKLIST_REQUIREMENT_RETIRED",
        entityType: "ChecklistCustomRequirement",
        entityId: id,
        ipAddress,
        detail: { name: existing.name },
      },
      tx
    );
  });
}
