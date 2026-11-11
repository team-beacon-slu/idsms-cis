// Overtime, undertime and absences reported on the day itself in the weekly report (adviser
// feedback, Nov 2026: IDSMS records them; approving leave is the company supervisor's job).
// Each reported day is kept as DeviationReport rows so credited OT, automatic deductions, the
// SLU OT/UT/absence PDFs and the calendar keep reading one table.
//
// The adviser decides: a reported row starts Pending (pending overtime is not credited);
// approving the week accepts the ones still pending, and the adviser may mark any one
// "not accepted" with a note, before or after (reviewTimeRequest), which takes its overtime
// off the credited hours and leaves an absence or early leave unexcused.
import {
  DeviationType,
  Prisma,
  RequestKind,
  ValidationStatus,
  type ProofType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDateKey } from "@/lib/utils/reportDeadline";
import { dayExceptions, type Shift } from "@/lib/utils/timeMath";
import type { DayNote } from "@/lib/validators/report";

// Marks the rows the weekly report writes (reviewNote starts with it; an adviser's note on one
// follows after ": "), so a re-save replaces only those, never a request filed the old way.
export const REPORTED_IN_WEEKLY = "Reported in the weekly report";
export const REPORTED_WHERE = { reviewNote: { startsWith: REPORTED_IN_WEEKLY } };
// Not from a weekly report (null-safe: NOT LIKE alone would drop rows with no note).
export const NOT_REPORTED_WHERE: Prisma.DeviationReportWhereInput = {
  OR: [{ reviewNote: null }, { NOT: REPORTED_WHERE }],
};

export const isReported = (reviewNote: string | null | undefined) =>
  Boolean(reviewNote?.startsWith(REPORTED_IN_WEEKLY));

// The adviser's own words on a reported row, if any.
export const adviserNoteOf = (reviewNote: string | null | undefined) =>
  isReported(reviewNote)
    ? reviewNote!.slice(REPORTED_IN_WEEKLY.length + 2) || null
    : (reviewNote ?? null);

// What reviewNote becomes when an adviser reviews a row: the marker survives on reported rows.
export const reviewNoteFor = (current: string | null, note: string | null) =>
  isReported(current) ? (note ? `${REPORTED_IN_WEEKLY}: ${note}` : REPORTED_IN_WEEKLY) : note;

export interface ReportedDay {
  studentProfileId: string;
  reportDate: Date;
  status: string; // PRESENT | ABSENT | HOLIDAY
  ranges: Array<[string, string]>;
  scheduledHours: number;
  shift: Shift | null;
  note?: DayNote;
}

// The rows a day's report stands for; none without a reason (an unexplained overtime simply
// isn't credited, an unexplained early leave blocks submitting).
export function reportedRows(day: ReportedDay): Prisma.DeviationReportCreateManyInput[] {
  const reason = day.note?.reason.trim();
  if (!reason) return [];
  const now = new Date();
  const base = {
    studentProfileId: day.studentProfileId,
    date: day.reportDate,
    reason,
    validationStatus: ValidationStatus.PENDING,
    reviewNote: REPORTED_IN_WEEKLY,
    submittedAt: now,
    updatedAt: now,
  };
  if (day.status === "ABSENT") {
    return [
      {
        ...base,
        deviationType: DeviationType.ABSENCE,
        requestKind: day.note?.requestKind ?? RequestKind.EMERGENCY,
        proofType: day.note?.proofType ?? null,
      },
    ];
  }
  if (day.status !== "PRESENT") return [];
  return dayExceptions(day.ranges, day.shift, day.scheduledHours > 0, day.scheduledHours).map(
    (x) => ({
      ...base,
      deviationType: x.kind === "overtime" ? DeviationType.OVERTIME : DeviationType.UNDERTIME,
      startTime: x.start,
      endTime: x.end,
      requestedMinutes: x.minutes,
    })
  );
}

type RowKey = {
  deviationType: string;
  startTime?: string | null;
  endTime?: string | null;
  requestedMinutes?: number | null;
  reason: string;
  proofType?: string | null;
  requestKind?: string | null;
};
const keyOf = (r: RowKey) =>
  [
    r.deviationType,
    r.startTime ?? "",
    r.endTime ?? "",
    r.requestedMinutes ?? "",
    r.reason,
    r.proofType ?? "",
    r.requestKind ?? "",
  ].join("|");

// Brings the day's reported rows in line with what was just saved. A row that didn't change
// keeps its adviser decision; a changed one starts Pending again.
export async function syncReportedDay(tx: Prisma.TransactionClient, day: ReportedDay) {
  const wanted = reportedRows(day);
  const existing = await tx.deviationReport.findMany({
    where: { studentProfileId: day.studentProfileId, date: day.reportDate, ...REPORTED_WHERE },
    select: {
      id: true,
      deviationType: true,
      startTime: true,
      endTime: true,
      requestedMinutes: true,
      reason: true,
      proofType: true,
      requestKind: true,
    },
  });
  const wantedKeys = new Set(wanted.map((w) => keyOf(w as RowKey)));
  const keep = new Set<string>();
  const stale: string[] = [];
  for (const e of existing) {
    const k = keyOf(e);
    if (wantedKeys.has(k) && !keep.has(k)) keep.add(k);
    else stale.push(e.id);
  }
  if (stale.length > 0) await tx.deviationReport.deleteMany({ where: { id: { in: stale } } });
  const add = wanted.filter((w) => !keep.has(keyOf(w as RowKey)));
  if (add.length > 0) await tx.deviationReport.createMany({ data: add });
}

export async function deleteReportedDays(
  tx: Prisma.TransactionClient,
  studentProfileId: string,
  dates: Date[]
) {
  await tx.deviationReport.deleteMany({
    where: { studentProfileId, date: { in: dates }, ...REPORTED_WHERE },
  });
}

// Approving (or regarding) a week accepts the reasons the adviser hasn't ruled on. Returns the
// dates whose overtime became credited, for recomputeCreditedHours after the commit.
export async function acceptReportedInWeek(
  tx: Prisma.TransactionClient,
  studentProfileId: string,
  weekStart: Date,
  weekEnd: Date,
  facultyId: string
): Promise<Date[]> {
  const where = {
    studentProfileId,
    date: { gte: weekStart, lte: weekEnd },
    validationStatus: ValidationStatus.PENDING,
    ...REPORTED_WHERE,
  };
  const overtime = await tx.deviationReport.findMany({
    where: { ...where, deviationType: DeviationType.OVERTIME },
    select: { date: true },
  });
  await tx.deviationReport.updateMany({
    where,
    data: { validationStatus: ValidationStatus.VALIDATED, facultyId },
  });
  return overtime.map((o) => o.date);
}

export interface ReportedRecord {
  id: string;
  type: "OVERTIME" | "UNDERTIME" | "ABSENCE";
  status: "PENDING" | "VALIDATED" | "REJECTED";
  adviserNote: string | null;
}

export interface StoredDayNote {
  reason: string;
  proofType?: ProofType;
  requestKind?: RequestKind;
  records: ReportedRecord[];
}

// Each reported day's note and its records' decisions, by date ("YYYY-MM-DD").
export async function loadDayNotes(
  studentProfileId: string,
  from: Date = new Date(0),
  to: Date = new Date(8.64e15)
): Promise<Record<string, StoredDayNote>> {
  const rows = await prisma.deviationReport.findMany({
    where: { studentProfileId, ...REPORTED_WHERE, date: { gte: from, lte: to } },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      date: true,
      deviationType: true,
      validationStatus: true,
      reviewNote: true,
      reason: true,
      proofType: true,
      requestKind: true,
    },
  });
  const notes: Record<string, StoredDayNote> = {};
  for (const r of rows) {
    const key = toDateKey(r.date);
    notes[key] ??= {
      reason: r.reason,
      ...(r.proofType ? { proofType: r.proofType } : {}),
      ...(r.requestKind ? { requestKind: r.requestKind } : {}),
      records: [],
    };
    notes[key].records.push({
      id: r.id,
      type: r.deviationType,
      status: r.validationStatus,
      adviserNote: adviserNoteOf(r.reviewNote),
    });
  }
  return notes;
}
