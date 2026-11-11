import { DeviationType, ValidationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { weekNumberOf } from "@/lib/documents/weeklyReportData";
import type {
  AbsenceRow,
  TimeReportDocumentData,
  TimeReportKind,
  TimeRow,
} from "@/lib/documents/timeReportTemplate";
import { displayNameFromEmail } from "@/lib/utils/displayName";

const TYPE = {
  OT: DeviationType.OVERTIME,
  UT: DeviationType.UNDERTIME,
  ABSENCE: DeviationType.ABSENCE,
} as const;

// What the OT, UT and absence reports print, for one weekly report's week or (no
// weeklyReportId) the whole internship. Rejected requests are left out; pending ones
// print marked as pending, as on the weekly report.
export async function loadTimeReportData(
  studentProfileId: string,
  kind: TimeReportKind,
  weeklyReportId?: string
): Promise<TimeReportDocumentData | null> {
  const [profile, report] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      select: {
        fullName: true,
        user: { select: { email: true } },
        company: { select: { name: true, supervisorName: true } },
      },
    }),
    weeklyReportId
      ? prisma.weeklyReport.findFirst({
          where: { id: weeklyReportId, studentProfileId },
          select: { weekStart: true, weekEnd: true },
        })
      : Promise.resolve(null),
  ]);
  if (!profile || (weeklyReportId && !report)) return null;
  const range = report ? { gte: report.weekStart, lte: report.weekEnd } : undefined;

  const [requests, absentDays, weekNumber] = await Promise.all([
    prisma.deviationReport.findMany({
      where: {
        studentProfileId,
        deviationType: TYPE[kind],
        validationStatus: { not: ValidationStatus.REJECTED },
        // A leave that starts before the week but runs into it still belongs to it.
        ...(range
          ? kind === "ABSENCE"
            ? { date: { lte: range.lte }, OR: [{ endDate: { gte: range.gte } }, { date: range }] }
            : { date: range }
          : {}),
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        endDate: true,
        startTime: true,
        endTime: true,
        requestedMinutes: true,
        reason: true,
        requestKind: true,
        proofType: true,
        validationStatus: true,
      },
    }),
    kind === "ABSENCE"
      ? prisma.dailyReportEntry.findMany({
          where: {
            attendanceStatus: "ABSENT",
            weeklyReport: { studentProfileId },
            ...(range ? { reportDate: range } : {}),
          },
          orderBy: { reportDate: "asc" },
          select: { reportDate: true },
        })
      : Promise.resolve([]),
    report ? weekNumberOf(studentProfileId, report.weekStart) : Promise.resolve(0),
  ]);

  const pending = (r: { validationStatus: ValidationStatus }) =>
    r.validationStatus === ValidationStatus.PENDING;
  const rows: TimeRow[] =
    kind === "ABSENCE"
      ? []
      : requests.map((r) => ({
          date: r.date,
          startTime: r.startTime,
          endTime: r.endTime,
          minutes: r.requestedMinutes ?? 0,
          reason: r.reason,
          pending: pending(r),
        }));

  let absences: AbsenceRow[] = [];
  if (kind === "ABSENCE") {
    const leaves = requests.map((r) => ({
      date: r.date,
      endDate: r.endDate,
      startTime: r.startTime,
      endTime: r.endTime,
      kind: r.requestKind,
      reason: r.reason,
      proof: r.proofType,
      pending: pending(r),
    }));
    // A day marked Absent that no leave covers is still an absence to report.
    const covered = (d: Date) => leaves.some((l) => l.date <= d && (l.endDate ?? l.date) >= d);
    const unfiled = absentDays
      .filter((e) => !covered(e.reportDate))
      .map((e) => ({
        date: e.reportDate,
        endDate: null,
        startTime: null,
        endTime: null,
        kind: null,
        reason: null,
        proof: null,
      }));
    absences = [...leaves, ...unfiled].sort((a, b) => +a.date - +b.date);
  }

  return {
    kind,
    student: { name: profile.fullName?.trim() || displayNameFromEmail(profile.user.email) },
    company: profile.company,
    week: report ? { number: weekNumber, start: report.weekStart, end: report.weekEnd } : null,
    rows,
    absences,
    generatedAt: new Date(),
  };
}
