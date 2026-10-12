import { DataRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ComplianceNotFoundError, DataRequestStateError } from "@/lib/errors/compliance";
import { logEvent } from "@/lib/services/auditService";
import { formatManilaDateTime, toSheetRows } from "@/lib/utils/excelExport";

// NFR-DP-07 data subject access requests: a ticket with a 15-day SLA, and the
// workbook the Super Admin hands back. The workbook holds only what the
// subject themself generated or is the subject of (data minimisation): no
// credentials, lockout counters, tokens, or storage object paths.

export const DSAR_SLA_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

const manilaDate = (d: Date) => formatManilaDateTime(d).slice(0, 10);
const manila = (d: Date | null | undefined) => (d ? formatManilaDateTime(d) : "");
const yesNo = (b: boolean) => (b ? "Yes" : "No");

export async function createDataRequest(
  userId: string,
  ip: string | null,
  now: Date = new Date()
): Promise<{ id: string; dueAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.dataRequest.findFirst({
      where: { userId, status: DataRequestStatus.OPEN },
      select: { dueAt: true },
    });
    if (existing) {
      throw new DataRequestStateError(
        `You already have an open request (due ${manilaDate(existing.dueAt)})`
      );
    }
    const dueAt = new Date(now.getTime() + DSAR_SLA_DAYS * DAY_MS);
    const created = await tx.dataRequest.create({
      data: { userId, requestedAt: now, dueAt },
      select: { id: true, dueAt: true },
    });
    await logEvent(
      {
        userId,
        action: "DSAR_REQUESTED",
        entityType: "DataRequest",
        entityId: created.id,
        ipAddress: ip,
      },
      tx
    );
    return { id: created.id, dueAt: created.dueAt };
  });
}

export async function getMyDataRequestSummary(
  userId: string
): Promise<{ open: { dueAt: Date } | null; lastFulfilledAt: Date | null }> {
  const [open, last] = await Promise.all([
    prisma.dataRequest.findFirst({
      where: { userId, status: DataRequestStatus.OPEN },
      select: { dueAt: true },
    }),
    prisma.dataRequest.findFirst({
      where: { userId, status: DataRequestStatus.FULFILLED },
      orderBy: { fulfilledAt: "desc" },
      select: { fulfilledAt: true },
    }),
  ]);
  return { open: open ? { dueAt: open.dueAt } : null, lastFulfilledAt: last?.fulfilledAt ?? null };
}

export async function listDataRequests(): Promise<{
  open: Array<{ id: string; email: string; requestedAt: Date; dueAt: Date }>;
  recentFulfilled: Array<{ id: string; email: string; requestedAt: Date; fulfilledAt: Date }>;
}> {
  const [open, fulfilled] = await Promise.all([
    prisma.dataRequest.findMany({
      where: { status: DataRequestStatus.OPEN },
      orderBy: { dueAt: "asc" },
      select: { id: true, requestedAt: true, dueAt: true, user: { select: { email: true } } },
    }),
    prisma.dataRequest.findMany({
      where: { status: DataRequestStatus.FULFILLED },
      orderBy: { fulfilledAt: "desc" },
      take: 10,
      select: {
        id: true,
        requestedAt: true,
        fulfilledAt: true,
        user: { select: { email: true } },
      },
    }),
  ]);
  return {
    open: open.map((r) => ({
      id: r.id,
      email: r.user.email,
      requestedAt: r.requestedAt,
      dueAt: r.dueAt,
    })),
    recentFulfilled: fulfilled.map((r) => ({
      id: r.id,
      email: r.user.email,
      requestedAt: r.requestedAt,
      fulfilledAt: r.fulfilledAt as Date,
    })),
  };
}

// Loads the request owner; 404 when the request does not exist.
export async function getDataRequestSubject(id: string): Promise<{ userId: string }> {
  const found = await prisma.dataRequest.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!found) throw new ComplianceNotFoundError("Request not found");
  return found;
}

export async function markDataRequestFulfilled(
  id: string,
  actingUserId: string
): Promise<{ userId: string }> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.dataRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!request) throw new ComplianceNotFoundError("Request not found");
    if (request.status !== DataRequestStatus.OPEN) {
      throw new DataRequestStateError("This request is already fulfilled");
    }
    // Guarded write: a concurrent fulfil that won the race leaves count 0.
    const { count } = await tx.dataRequest.updateMany({
      where: { id, status: DataRequestStatus.OPEN },
      data: {
        status: DataRequestStatus.FULFILLED,
        fulfilledAt: new Date(),
        fulfilledBy: actingUserId,
      },
    });
    if (count === 0) throw new DataRequestStateError("This request is already fulfilled");
    await logEvent(
      { userId: actingUserId, action: "DSAR_FULFILLED", entityType: "DataRequest", entityId: id },
      tx
    );
    return { userId: request.userId };
  });
}

type Row = Record<string, unknown>;
interface PersonalSheet {
  name: string;
  rows: (string | number)[][];
}

function sheet(name: string, columns: string[], rows: Row[]): PersonalSheet {
  return {
    name,
    rows: toSheetRows(
      rows,
      columns.map((c) => ({ key: c, header: c }))
    ),
  };
}

// Every query is keyed on the requester's own user id / student profile id.
export async function buildPersonalDataWorkbook(
  userId: string
): Promise<{ sheets: PersonalSheet[]; email: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      studentProfile: {
        select: {
          id: true,
          studentNumber: true,
          program: true,
          requiredHours: true,
          fullName: true,
          positionTitle: true,
          classGroup: { select: { name: true } },
          semester: { select: { name: true } },
          company: { select: { name: true } },
        },
      },
    },
  });
  if (!user) throw new ComplianceNotFoundError("User not found");
  const profile = user.studentProfile;
  const pid = profile?.id;

  const [checklist, workPlans, entries, reports, deviations, documents, notifications, audit] =
    await Promise.all([
      pid
        ? prisma.preDeploymentChecklistItem.findMany({
            where: { studentProfileId: pid },
            orderBy: { createdAt: "asc" },
            select: {
              requirementType: true,
              status: true,
              reviewDate: true,
              comments: true,
            },
          })
        : [],
      pid
        ? prisma.workPlan.findMany({
            where: { studentProfileId: pid },
            orderBy: { createdAt: "asc" },
            select: { status: true, createdAt: true, plannedTasks: true },
          })
        : [],
      pid
        ? prisma.dailyReportEntry.findMany({
            where: { weeklyReport: { studentProfileId: pid } },
            orderBy: { reportDate: "asc" },
            select: {
              reportDate: true,
              attendanceStatus: true,
              timeIn: true,
              timeOut: true,
              actualHours: true,
              accomplishments: true,
              toolsUsed: true,
            },
          })
        : [],
      pid
        ? prisma.weeklyReport.findMany({
            where: { studentProfileId: pid },
            orderBy: { weekStart: "asc" },
            select: { weekStart: true, status: true, totalHours: true, facultyAction: true },
          })
        : [],
      pid
        ? prisma.deviationReport.findMany({
            where: { studentProfileId: pid },
            orderBy: { date: "asc" },
            select: { date: true, deviationType: true, reason: true, validationStatus: true },
          })
        : [],
      pid
        ? prisma.generatedDocument.findMany({
            where: { studentProfileId: pid },
            select: {
              documentType: true,
              periodLabel: true,
              status: true,
              referenceCode: true,
              generatedAt: true,
            },
          })
        : [],
      prisma.notification.findMany({
        where: { userId },
        orderBy: { sentAt: "asc" },
        select: { sentAt: true, triggerType: true, payload: true, readAt: true },
      }),
      prisma.auditLog.findMany({
        where: { userId },
        orderBy: { timestamp: "asc" },
        select: { timestamp: true, action: true, entityType: true, ipAddress: true },
      }),
    ]);

  const titleOf = (payload: unknown) =>
    payload && typeof payload === "object" && "title" in payload
      ? String((payload as { title: unknown }).title ?? "")
      : "";

  const sheets: PersonalSheet[] = [
    sheet(
      "Account",
      ["Email", "Role", "Active", "Created"],
      [
        {
          Email: user.email,
          Role: user.role,
          Active: yesNo(user.isActive),
          Created: manila(user.createdAt),
        },
      ]
    ),
    sheet(
      "Student profile",
      [
        "Student number",
        "Program",
        "Class group",
        "Semester",
        "Company",
        "Required hours",
        "Full name",
        "Position",
      ],
      profile
        ? [
            {
              "Student number": profile.studentNumber,
              Program: profile.program,
              "Class group": profile.classGroup.name,
              Semester: profile.semester.name,
              Company: profile.company?.name ?? "",
              "Required hours": profile.requiredHours,
              "Full name": profile.fullName,
              Position: profile.positionTitle,
            },
          ]
        : []
    ),
    sheet(
      "Checklist",
      ["Requirement", "Status", "Reviewed at", "Comments"],
      checklist.map((c) => ({
        Requirement: c.requirementType,
        Status: c.status,
        "Reviewed at": manila(c.reviewDate),
        Comments: c.comments,
      }))
    ),
    sheet(
      "Work plan",
      ["Status", "Created", "Planned tasks"],
      workPlans.map((w) => ({
        Status: w.status,
        Created: manila(w.createdAt),
        "Planned tasks": JSON.stringify(w.plannedTasks),
      }))
    ),
    sheet(
      "Attendance",
      ["Date", "Status", "Time in", "Time out", "Hours", "Accomplishments", "Tools"],
      entries.map((e) => ({
        Date: manilaDate(e.reportDate),
        Status: e.attendanceStatus,
        "Time in": e.timeIn,
        "Time out": e.timeOut,
        Hours: e.actualHours === null ? null : Number(e.actualHours),
        Accomplishments: e.accomplishments,
        Tools: e.toolsUsed,
      }))
    ),
    sheet(
      "Weekly reports",
      ["Week", "Status", "Hours", "Faculty action"],
      reports.map((r) => ({
        Week: manilaDate(r.weekStart),
        Status: r.status,
        Hours: Number(r.totalHours),
        "Faculty action": r.facultyAction,
      }))
    ),
    sheet(
      "Deviation reports",
      ["Date", "Type", "Reason", "Validation status"],
      deviations.map((d) => ({
        Date: manilaDate(d.date),
        Type: d.deviationType,
        Reason: d.reason,
        "Validation status": d.validationStatus,
      }))
    ),
    sheet(
      "Generated documents",
      ["Type", "Period", "Status", "Reference code", "Generated at"],
      documents.map((d) => ({
        Type: d.documentType,
        Period: d.periodLabel,
        Status: d.status,
        "Reference code": d.referenceCode,
        "Generated at": manila(d.generatedAt),
      }))
    ),
    sheet(
      "Notifications",
      ["When", "Type", "Title", "Read"],
      notifications.map((n) => ({
        When: manila(n.sentAt),
        Type: n.triggerType,
        Title: titleOf(n.payload),
        Read: yesNo(n.readAt !== null),
      }))
    ),
    sheet(
      "Activity",
      ["Timestamp", "Action", "Entity type", "IP address"],
      audit.map((a) => ({
        Timestamp: manila(a.timestamp),
        Action: a.action,
        "Entity type": a.entityType,
        "IP address": a.ipAddress,
      }))
    ),
  ];

  return { sheets, email: user.email };
}
