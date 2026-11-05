// "Waiting on you": everything a reviewer must decide, each with a direct link, so staff
// don't have to remember where pending work lives (efficiency plan items 20 and 21).
import {
  ChecklistStatus,
  FinalReportStatus,
  ValidationStatus,
  WorkPlanStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLatestScheduleChangeStatus } from "@/lib/services/attendance/attendanceService";
import { getExpiringMoaRecords } from "@/lib/services/predeployment/companyService";

export type WaitingItem = { key: string; intern: string; what: string; href: string };

const internName = (p: { fullName: string | null; studentNumber: string | null }) =>
  p.fullName || p.studentNumber || "An intern";
const profileSelect = { id: true, fullName: true, studentNumber: true } as const;

const REQUEST_LABEL: Record<string, string> = {
  ABSENCE: "Leave",
  OVERTIME: "Overtime",
  UNDERTIME: "Undertime",
};

// The latest work plan per intern whose last schedule-change entry has `status`.
async function scheduleChangesAt(
  status: "PENDING_FACULTY" | "PENDING_COORDINATOR",
  studentWhere: object
) {
  const plans = await prisma.workPlan.findMany({
    where: {
      status: WorkPlanStatus.APPROVED,
      studentProfile: { deletedAt: null, ...studentWhere },
    },
    orderBy: { createdAt: "desc" },
    select: {
      studentProfileId: true,
      scheduleChangeHistory: true,
      studentProfile: { select: profileSelect },
    },
  });
  const seen = new Set<string>();
  return plans.filter((p) => {
    if (seen.has(p.studentProfileId)) return false;
    seen.add(p.studentProfileId);
    return getLatestScheduleChangeStatus(p.scheduleChangeHistory) === status;
  });
}

// The adviser's queue beyond weekly reports: time requests, schedule changes to validate,
// and checklist items the intern marked uploaded (approved in bulk on the class grid).
export async function getAdviserWaiting(facultyId: string) {
  const groups = await prisma.facultyClassGroup.findMany({
    where: { facultyId, semester: { archivedAt: null } },
    select: { classGroupId: true, semesterId: true },
  });
  if (groups.length === 0) return { timeRequests: [], scheduleChanges: [], uploadedChecklist: 0 };
  const inGroups = {
    OR: groups.map((g) => ({ classGroupId: g.classGroupId, semesterId: g.semesterId })),
  };

  const [requests, changes, uploadedChecklist] = await Promise.all([
    prisma.deviationReport.findMany({
      where: {
        validationStatus: ValidationStatus.PENDING,
        studentProfile: { deletedAt: null, ...inGroups },
      },
      orderBy: { date: "asc" },
      select: {
        id: true,
        deviationType: true,
        date: true,
        reason: true,
        proofType: true,
        proofUrl: true,
        studentProfileId: true,
        studentProfile: { select: profileSelect },
      },
    }),
    scheduleChangesAt("PENDING_FACULTY", inGroups),
    prisma.preDeploymentChecklistItem.count({
      where: {
        status: ChecklistStatus.PENDING,
        uploadedAt: { not: null },
        archivedAt: null,
        studentProfile: { deletedAt: null, ...inGroups },
      },
    }),
  ]);

  return {
    timeRequests: requests.map((r) => ({
      id: r.id,
      intern: internName(r.studentProfile),
      kind: REQUEST_LABEL[r.deviationType] ?? r.deviationType,
      date: r.date,
      reason: r.reason,
      proofType: r.proofType,
      hasProof: Boolean(r.proofUrl),
      href: `/students/${r.studentProfileId}/leave-requests`,
    })),
    scheduleChanges: changes.map((c): WaitingItem => ({
      key: `sc-${c.studentProfileId}`,
      intern: internName(c.studentProfile),
      what: "Schedule change to validate",
      href: `/students/${c.studentProfileId}/attendance`,
    })),
    uploadedChecklist,
  };
}

// The coordinator's list: what only the coordinator (or Super Admin) decides.
export async function getCoordinatorWaiting(moaWarningDays = 30): Promise<WaitingItem[]> {
  const [plans, changes, finals, disputes, unverified, moas] = await Promise.all([
    prisma.workPlan.findMany({
      where: { status: WorkPlanStatus.SUBMITTED, studentProfile: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, studentProfileId: true, studentProfile: { select: profileSelect } },
    }),
    scheduleChangesAt("PENDING_COORDINATOR", {}),
    prisma.finalTechnicalReport.findMany({
      where: { status: FinalReportStatus.SUBMITTED, studentProfile: { deletedAt: null } },
      orderBy: { submittedAt: "asc" },
      select: { studentProfileId: true, studentProfile: { select: profileSelect } },
    }),
    prisma.deductionDispute.findMany({
      where: { resolvedAt: null, studentProfile: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, studentProfileId: true, studentProfile: { select: profileSelect } },
    }),
    prisma.company.count({ where: { isVerified: false, deletedAt: null } }),
    getExpiringMoaRecords(moaWarningDays),
  ]);

  return [
    ...plans.map((p) => ({
      key: `wp-${p.id}`,
      intern: internName(p.studentProfile),
      what: "Work plan to review",
      href: `/students/${p.studentProfileId}/work-plan`,
    })),
    ...changes.map((c) => ({
      key: `sc-${c.studentProfileId}`,
      intern: internName(c.studentProfile),
      what: "Schedule change for final approval",
      href: `/students/${c.studentProfileId}/attendance`,
    })),
    ...finals.map((f) => ({
      key: `fr-${f.studentProfileId}`,
      intern: internName(f.studentProfile),
      what: "Final technical report to review",
      href: `/students/${f.studentProfileId}/final-report`,
    })),
    ...disputes.map((d) => ({
      key: `dd-${d.id}`,
      intern: internName(d.studentProfile),
      what: "Deduction dispute to resolve",
      href: `/students/${d.studentProfileId}/attendance`,
    })),
    ...(unverified > 0
      ? [
          {
            key: "companies",
            intern: `${unverified} ${unverified === 1 ? "company" : "companies"}`,
            what: "Not verified yet",
            href: "/companies",
          },
        ]
      : []),
    ...moas.map((m) => ({
      key: `moa-${m.id}`,
      intern: "MOA",
      what: `Expires ${m.validTo.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}: start the renewal`,
      href: `/companies/${m.companyId}`,
    })),
  ];
}
