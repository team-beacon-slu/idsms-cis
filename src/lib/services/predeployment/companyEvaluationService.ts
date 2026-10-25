// Company view (docs/plans/ai-assist-plan.md §10). The intern rates their host
// company once all required hours are confirmed; staff see the company's facts
// and pooled ratings only once 5 interns are behind them, so no single intern
// can be singled out. The coordinator records the company's reply (CMO 104).
import { DeviationType, Prisma, Role, ValidationStatus, WeeklyReportStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import { calculateRenderedHours } from "@/lib/services/attendance/attendanceService";
import { CompanyStateError } from "@/lib/services/predeployment/companyService";
import { history } from "@/lib/utils/automaticDeductions";

type ActingUser = { id: string; role: Role };

// The research's minimum group size: no aggregate below 5 interns, pooled across terms.
export const MIN_GROUP = 5;

export const CRITERIA = [
  { key: "supervision", label: "Supervision and mentoring" },
  { key: "learning", label: "Learning and relevance to my program" },
  { key: "safety", label: "Safety and welfare" },
  { key: "communication", label: "Communication and onboarding" },
  { key: "integration", label: "Integration and treatment" },
  { key: "resources", label: "Resources and equipment" },
  { key: "recommend", label: "I would recommend this company to other interns" },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

const rating = z.number().int().min(1).max(5);
const evaluationSchema = z.object({
  supervision: rating,
  learning: rating,
  safety: rating,
  communication: rating,
  integration: rating,
  resources: rating,
  recommend: rating,
  comment: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((c) => c || null),
});

const replySchema = z.object({ reply: z.string().trim().min(10).max(2000) });

export const REPLY_EDITORS: Role[] = [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

// What the intern's page needs: whether the form is open, and whether it's done.
export async function getEvaluationState(studentProfileId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: {
      requiredHours: true,
      company: { select: { name: true } },
      companyEvaluation: { select: { createdAt: true } },
    },
  });
  if (!profile) return null;
  const confirmedHours = await calculateRenderedHours(studentProfileId);
  return {
    companyName: profile.company?.name ?? null,
    confirmedHours,
    requiredHours: profile.requiredHours,
    open: !!profile.company && confirmedHours >= profile.requiredHours,
    submittedAt: profile.companyEvaluation?.createdAt ?? null,
  };
}

export async function submitCompanyEvaluation(
  studentProfileId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null
): Promise<{ id: string }> {
  if (actingUser.role !== Role.STUDENT_INTERN) throw new ForbiddenError();
  await assertCanAccessStudent(actingUser, studentProfileId);
  const data = evaluationSchema.parse(input);
  const state = await getEvaluationState(studentProfileId);
  if (!state?.companyName) throw new CompanyStateError("You have no host company to evaluate");
  if (!state.open) {
    throw new CompanyStateError(
      "The company evaluation opens once all your required hours are confirmed"
    );
  }
  const profile = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentProfileId },
    select: { companyId: true },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.companyEvaluation.create({
        data: { studentProfileId, companyId: profile.companyId!, ...data },
        select: { id: true },
      });
      await logEvent(
        {
          userId: actingUser.id,
          action: "COMPANY_EVALUATED",
          entityType: "CompanyEvaluation",
          entityId: created.id,
          ipAddress: ip,
        },
        tx
      );
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CompanyStateError("You have already evaluated your company");
    }
    throw error;
  }
}

const average = (values: number[]) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0;

// Staff view of one company. Facts and ratings each need MIN_GROUP interns behind them.
// shortcut: placements are each intern's current company only (no placement history),
// so an intern moved to another company counts there; add a history table if moves become common.
export async function getCompanyFeedback(companyId: string) {
  const [company, interns, evaluations] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { hteReply: true, hteReplyAt: true },
    }),
    prisma.studentProfile.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, semester: { select: { name: true } } },
    }),
    prisma.companyEvaluation.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const placements = new Map<string, number>();
  for (const i of interns)
    placements.set(i.semester.name, (placements.get(i.semester.name) ?? 0) + 1);

  let facts = null;
  if (interns.length >= MIN_GROUP) {
    const ids = interns.map((i) => i.id);
    const [reports, overtime, absences] = await Promise.all([
      prisma.weeklyReport.findMany({
        where: { studentProfileId: { in: ids } },
        select: { status: true, totalHours: true, revisionHistory: true },
      }),
      prisma.deviationReport.count({
        where: {
          studentProfileId: { in: ids },
          deviationType: DeviationType.OVERTIME,
          validationStatus: ValidationStatus.VALIDATED,
        },
      }),
      prisma.deviationReport.count({
        where: {
          studentProfileId: { in: ids },
          deviationType: DeviationType.ABSENCE,
          validationStatus: ValidationStatus.VALIDATED,
        },
      }),
    ]);
    const confirmed = reports.filter(
      (r) => r.status === WeeklyReportStatus.APPROVED || r.status === WeeklyReportStatus.REGARDED
    );
    // The first submission decides lateness, as for deductions.
    const firsts = reports
      .map((r) => history(r).find((h) => h.type === "SUBMITTED"))
      .filter((h) => h !== undefined);
    facts = {
      averageWeeklyHours: average(confirmed.map((r) => Number(r.totalHours))),
      onTimeShare: firsts.length
        ? Math.round((firsts.filter((h) => !h.late).length / firsts.length) * 100)
        : null,
      overtime,
      absences,
    };
  }

  const ratings =
    evaluations.length >= MIN_GROUP
      ? {
          count: evaluations.length,
          averages: CRITERIA.map((c) => ({
            ...c,
            average: average(evaluations.map((e) => e[c.key])),
          })),
          // Alphabetical, not newest first, so the order doesn't hint at who wrote what.
          comments: evaluations.flatMap((e) => (e.comment ? [e.comment] : [])).sort(),
        }
      : null;

  return {
    internCount: interns.length,
    placements: [...placements].map(([term, count]) => ({ term, count })),
    facts,
    evaluationCount: evaluations.length,
    ratings,
    reply: company?.hteReply ? { text: company.hteReply, at: company.hteReplyAt } : null,
  };
}

export async function setCompanyReply(
  companyId: string,
  input: unknown,
  actingUser: ActingUser,
  ip?: string | null
): Promise<void> {
  if (!REPLY_EDITORS.includes(actingUser.role)) throw new ForbiddenError();
  const { reply } = replySchema.parse(input);
  await prisma.$transaction(async (tx) => {
    // A merged-away (soft-deleted) company is "not found" (P2025), like a missing one.
    await tx.company.update({
      where: { id: companyId, deletedAt: null },
      data: { hteReply: reply, hteReplyAt: new Date(), hteReplyBy: actingUser.id },
    });
    await logEvent(
      {
        userId: actingUser.id,
        action: "COMPANY_REPLY_RECORDED",
        entityType: "Company",
        entityId: companyId,
        ipAddress: ip,
      },
      tx
    );
  });
}
