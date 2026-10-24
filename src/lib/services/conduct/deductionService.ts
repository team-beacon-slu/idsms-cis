// Workstream L2: the deduction matrix and default hours per conduct record
// (SystemConfig), automatic deduction items, excuses and the per-intern tally.
import { z } from "zod";
import { DeviationType, Prisma, Role, WorkPlanStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import {
  findAutomaticItems,
  sameItemFamily,
  type AutomaticItem,
} from "@/lib/utils/automaticDeductions";
import { DEFAULT_MATRIX, tallyDeductions, type MatrixCategory } from "@/lib/utils/deductionMatrix";
import { deductionMatrixSchema } from "@/lib/validators/deductionMatrix";
import { parseScheduleConfig } from "@/lib/utils/schedule";
import { scheduleShift } from "@/lib/utils/timeMath";

type ActingUser = { id: string; role: Role };

// Who may issue, revoke and excuse: the assigned adviser, coordinator, Super Admin.
export const CONDUCT_STAFF_ROLES: Role[] = [
  Role.FACULTY_ADVISER,
  Role.DEPARTMENT_COORDINATOR,
  Role.SUPER_ADMIN,
];

// A revoke or withdraw that already happened (409).
export class ConductStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConductStateError";
  }
}

export async function assertStaffFor(actingUser: ActingUser, studentProfileId: string) {
  if (!CONDUCT_STAFF_ROLES.includes(actingUser.role)) throw new ForbiddenError();
  await assertCanAccessStudent(actingUser, studentProfileId);
}

const MATRIX_KEY = "deduction_matrix";
const DEFAULT_HOURS_KEY = "conduct:default_hours";
export const MAX_CONDUCT_HOURS = 40;

async function upsertConfig(
  configKey: string,
  configValue: Prisma.InputJsonValue,
  action: string,
  actingUserId: string
) {
  await prisma.$transaction(async (tx) => {
    const config = await tx.systemConfig.upsert({
      where: { configKey },
      create: { configKey, configValue, updatedBy: actingUserId },
      update: { configValue, updatedBy: actingUserId },
      select: { id: true },
    });
    await logEvent(
      { userId: actingUserId, action, entityType: "SystemConfig", entityId: config.id },
      tx
    );
  });
}

export async function getDeductionMatrix(): Promise<MatrixCategory[]> {
  const config = await prisma.systemConfig.findUnique({
    where: { configKey: MATRIX_KEY },
    select: { configValue: true },
  });
  const parsed = deductionMatrixSchema.safeParse(config?.configValue);
  return parsed.success ? parsed.data : DEFAULT_MATRIX;
}

export async function setDeductionMatrix(input: unknown, actingUserId: string): Promise<void> {
  const matrix = deductionMatrixSchema.parse(input);
  await upsertConfig(MATRIX_KEY, matrix, "DEDUCTION_MATRIX_UPDATED", actingUserId);
}

export async function getDefaultConductHours(): Promise<number> {
  const config = await prisma.systemConfig.findUnique({
    where: { configKey: DEFAULT_HOURS_KEY },
    select: { configValue: true },
  });
  return typeof config?.configValue === "number" ? config.configValue : 0;
}

export async function setDefaultConductHours(hours: number, actingUserId: string): Promise<void> {
  const value = z.number().min(0).max(MAX_CONDUCT_HOURS).parse(hours);
  await upsertConfig(DEFAULT_HOURS_KEY, value, "CONDUCT_DEFAULT_HOURS_UPDATED", actingUserId);
}

// ── Automatic items and excuses ────────────────────────────────────────────

export type AutomaticItemView = AutomaticItem & {
  excused: { id: string; reasonCode: string; note: string } | null;
};

export async function listAutomaticItems(
  studentProfileId: string,
  now: Date = new Date()
): Promise<AutomaticItemView[]> {
  return (await listAutomaticItemsMany([studentProfileId], now)).get(studentProfileId) ?? [];
}

// One query per table for the whole list, not per intern: the adviser dashboard tallies
// every advisee, and loading them one by one cost ~8 queries each.
async function listAutomaticItemsMany(
  ids: string[],
  now: Date
): Promise<Map<string, AutomaticItemView[]>> {
  const where = { studentProfileId: { in: ids } };
  const [plans, profiles, reports, requests, exceptions] = await Promise.all([
    // Same rule as getLatestApprovedWorkPlanForStudent: the newest approved plan per intern.
    prisma.workPlan.findMany({
      where: { ...where, status: WorkPlanStatus.APPROVED },
      orderBy: { createdAt: "desc" },
      distinct: ["studentProfileId"],
      select: { studentProfileId: true, scheduleConfig: true },
    }),
    prisma.studentProfile.findMany({
      where: { id: { in: ids } },
      select: { id: true, semester: { select: { endDate: true } } },
    }),
    prisma.weeklyReport.findMany({
      where,
      select: {
        id: true,
        studentProfileId: true,
        weekStart: true,
        weekEnd: true,
        revisionHistory: true,
        dailyEntries: {
          select: {
            reportDate: true,
            scheduledHours: true,
            attendanceStatus: true,
            timeIn: true,
            timeOut: true,
            timeIn2: true,
            timeOut2: true,
          },
        },
      },
    }),
    prisma.deviationReport.findMany({
      where: { ...where, deviationType: { in: [DeviationType.UNDERTIME, DeviationType.ABSENCE] } },
      select: {
        studentProfileId: true,
        deviationType: true,
        validationStatus: true,
        date: true,
        endDate: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.deductionException.findMany({
      where: { ...where, withdrawnAt: null },
      select: {
        id: true,
        studentProfileId: true,
        itemType: true,
        itemKey: true,
        reasonCode: true,
        note: true,
      },
    }),
  ]);
  const result = new Map<string, AutomaticItemView[]>();
  for (const id of ids) {
    const schedule = parseScheduleConfig(
      plans.find((p) => p.studentProfileId === id)?.scheduleConfig
    );
    const excuses = exceptions.filter((e) => e.studentProfileId === id);
    const items = findAutomaticItems({
      now,
      shift: schedule ? scheduleShift(schedule) : null,
      semesterEnd: profiles.find((p) => p.id === id)?.semester?.endDate ?? null,
      reports: reports.filter((r) => r.studentProfileId === id),
      requests: requests.filter((r) => r.studentProfileId === id),
    });
    result.set(
      id,
      items.map((item) => {
        const ex = excuses.find(
          (e) => sameItemFamily(e.itemType, item.itemType) && e.itemKey === item.itemKey
        );
        return {
          ...item,
          excused: ex ? { id: ex.id, reasonCode: ex.reasonCode, note: ex.note } : null,
        };
      })
    );
  }
  return result;
}

// The intern's deduction tally (ADVISER / WWR points per category).
export async function getDeductionTally(studentProfileId: string, now: Date = new Date()) {
  const tallies = await getDeductionTallies([studentProfileId], now);
  return tallies.get(studentProfileId) as ReturnType<typeof tallyDeductions>;
}

// Tallies for many interns in a fixed number of queries, however many there are.
export async function getDeductionTallies(ids: string[], now: Date = new Date()) {
  const [matrix, records, items] = await Promise.all([
    getDeductionMatrix(),
    prisma.conductRecord.findMany({
      where: { studentProfileId: { in: ids }, revokedAt: null },
      select: { studentProfileId: true, categoryKey: true, weight: true },
    }),
    listAutomaticItemsMany(ids, now),
  ]);
  return new Map(
    ids.map((id) => [
      id,
      tallyDeductions(
        matrix,
        records.filter((r) => r.studentProfileId === id),
        (items.get(id) ?? []).filter((i) => !i.excused)
      ),
    ])
  );
}

const excuseSchema = z.object({
  itemType: z.enum(["LATE_WWR", "MISSING_WWR", "UNSUPPORTED_UT"]),
  itemKey: z.string().min(1).max(64),
  reasonCode: z.enum(["HTE_ATTESTED_DOCUMENTATION", "BEYOND_INTERN_CONTROL"]),
  note: z.string().trim().min(10, "Give a note of at least 10 characters").max(500),
});

// SLU exception: HTE-attested documentation or circumstances beyond the
// intern's control. The documentation itself stays in Google Classroom.
export async function excuseItem(
  studentProfileId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null,
  now: Date = new Date()
): Promise<{ id: string }> {
  await assertStaffFor(actingUser, studentProfileId);
  const data = excuseSchema.parse(input);
  const items = await listAutomaticItems(studentProfileId, now);
  z.literal(true, { message: "That item isn't on this intern's record" }).parse(
    items.some((i) => sameItemFamily(i.itemType, data.itemType) && i.itemKey === data.itemKey)
  );
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.deductionException.create({
        data: { studentProfileId, ...data, createdById: actingUser.id },
        select: { id: true },
      });
      await logEvent(
        {
          userId: actingUser.id,
          action: "DEDUCTION_EXCUSED",
          entityType: "DeductionException",
          entityId: created.id,
          ipAddress: ip,
          detail: { studentProfileId, ...data },
        },
        tx
      );
      return created;
    });
  } catch (error) {
    // The partial unique index allows one active excuse per item.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConductStateError("This item is already excused");
    }
    throw error;
  }
}

export async function withdrawExcuse(
  id: string,
  actingUser: ActingUser,
  ip?: string | null
): Promise<void> {
  const ex = await prisma.deductionException.findUniqueOrThrow({
    where: { id },
    select: { studentProfileId: true },
  });
  await assertStaffFor(actingUser, ex.studentProfileId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.deductionException.updateMany({
      where: { id, withdrawnAt: null },
      data: { withdrawnAt: new Date(), withdrawnById: actingUser.id },
    });
    if (count === 0) throw new ConductStateError("This excuse was already withdrawn");
    await logEvent(
      {
        userId: actingUser.id,
        action: "DEDUCTION_EXCUSE_WITHDRAWN",
        entityType: "DeductionException",
        entityId: id,
        ipAddress: ip,
      },
      tx
    );
  });
}
