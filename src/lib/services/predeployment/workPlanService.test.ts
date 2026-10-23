import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { DocumentStatus, DocumentType, Role, WorkPlanStatus } from "@prisma/client";
import {
  WorkPlanPendingError,
  WorkPlanStateError,
  getLatestApprovedWorkPlanForStudent,
  getLatestWorkPlanForStudent,
  getWorkPlanHistory,
  reviewWorkPlan,
  submitWorkPlan,
} from "@/lib/services/predeployment/workPlanService";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import { submitWorkPlanSchema } from "@/lib/validators/workPlan";

// SUPER_ADMIN skips assertCanAccessStudent's profile lookup entirely (see
// userService.test.ts), keeping these tests focused on workPlanService's own
// submit-lock / review-gate / letter-queuing logic.
const adminUser = { id: "admin-1", role: Role.SUPER_ADMIN };

beforeEach(() => {
  resetPrismaMock();
});

describe("submitWorkPlan", () => {
  it("blocks a new submission while the latest one is still SUBMITTED", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({ status: WorkPlanStatus.SUBMITTED } as never);

    await expect(submitWorkPlan("profile-1", { plannedTasks: [] }, adminUser)).rejects.toThrow(
      WorkPlanPendingError
    );
    expect(prismaMock.workPlan.create).not.toHaveBeenCalled();
  });

  it("allows a new submission when the latest one was RETURNED", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({ status: WorkPlanStatus.RETURNED } as never);
    prismaMock.workPlan.create.mockResolvedValue({ id: "wp-2" } as never);

    const result = await submitWorkPlan("profile-1", { plannedTasks: [] }, adminUser);

    expect(result.id).toBe("wp-2");
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "WORK_PLAN_SUBMITTED" }) })
    );
  });

  it("allows the first-ever submission when no prior work plan exists", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue(null);
    prismaMock.workPlan.create.mockResolvedValue({ id: "wp-1" } as never);

    await expect(
      submitWorkPlan("profile-1", { plannedTasks: [] }, adminUser)
    ).resolves.toMatchObject({ id: "wp-1" });
  });

  // Schedules are read from the latest APPROVED plan, so a resubmitted plan that
  // doesn't carry the schedule would drop it the moment it is approved.
  const approved = {
    id: "wp-1",
    status: WorkPlanStatus.APPROVED,
    scheduleConfig: { daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 8 },
    scheduleChangeHistory: [{ action: "REQUESTED" }],
  };
  const latestIs = (latest: object) =>
    prismaMock.workPlan.findFirst.mockImplementation(((args: {
      where: { status?: WorkPlanStatus };
    }) =>
      Promise.resolve(args.where.status === WorkPlanStatus.APPROVED ? approved : latest)) as never);

  it("does not copy the schedule at submission (a pending change may still be decided)", async () => {
    latestIs(approved);
    prismaMock.workPlan.create.mockResolvedValue({ id: "wp-3" } as never);

    await submitWorkPlan("profile-1", { plannedTasks: ["new task"] }, adminUser);

    const data = prismaMock.workPlan.create.mock.calls[0][0].data;
    expect(data.scheduleConfig).toBeUndefined();
    expect(data).not.toHaveProperty("scheduleChangeHistory");
  });

  it("carries the schedule current at approval, including a change decided after submission", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      id: "wp-3",
      studentProfileId: "profile-1",
      status: WorkPlanStatus.SUBMITTED,
      scheduleConfig: null,
    } as never);
    const decided = {
      ...approved,
      scheduleConfig: { daysOfWeek: [1, 2, 3, 4], hoursPerDay: 10 },
      scheduleChangeHistory: [{ action: "REQUESTED" }, { action: "APPROVED" }],
    };
    prismaMock.workPlan.findFirst.mockResolvedValue(decided as never);
    prismaMock.workPlan.update.mockResolvedValue({ id: "wp-3" } as never);
    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: "letter" } as never);

    await reviewWorkPlan("wp-3", "APPROVE", undefined, adminUser);

    expect(prismaMock.workPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: "wp-3" } }) })
    );
    expect(prismaMock.workPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduleConfig: decided.scheduleConfig,
          scheduleChangeHistory: decided.scheduleChangeHistory,
        }),
      })
    );
  });

  it("lets an explicit schedule in the submission win", async () => {
    latestIs(approved);
    prismaMock.workPlan.create.mockResolvedValue({ id: "wp-3" } as never);
    const scheduleConfig = { daysOfWeek: [1, 3, 5], hoursPerDay: 6 };

    await submitWorkPlan("profile-1", { plannedTasks: [], scheduleConfig }, adminUser);

    expect(prismaMock.workPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scheduleConfig }),
    });
  });
});

describe("work plan rules from the 2026-10-21 review", () => {
  it("refuses to review a plan that was already decided", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      id: "wp-1",
      studentProfileId: "profile-1",
      status: WorkPlanStatus.APPROVED,
    } as never);

    await expect(reviewWorkPlan("wp-1", "RETURN", "late change", adminUser)).rejects.toThrow(
      WorkPlanStateError
    );
    expect(prismaMock.workPlan.update).not.toHaveBeenCalled();
  });

  it("rejects a schedule the calendar could never finish projecting", () => {
    const parse = (scheduleConfig: unknown) =>
      submitWorkPlanSchema.safeParse({ plannedTasks: [{ description: "Build" }], scheduleConfig });

    expect(parse({ daysOfWeek: [7], hoursPerDay: 8 }).success).toBe(false);
    expect(parse({ daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 0 }).success).toBe(false);
    expect(parse({ daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 8 }).success).toBe(true);
  });
});

describe("reviewWorkPlan", () => {
  it("rejects a Faculty Adviser — review is Coordinator/Admin only (FR-WP-02)", async () => {
    await expect(
      reviewWorkPlan("wp-1", "APPROVE", undefined, {
        id: "faculty-1",
        role: Role.FACULTY_ADVISER,
      })
    ).rejects.toThrow(ForbiddenError);
    expect(prismaMock.workPlan.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("allows a Department Coordinator to approve", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      id: "wp-1",
      studentProfileId: "profile-1",
      status: WorkPlanStatus.SUBMITTED,
    } as never);
    prismaMock.workPlan.update.mockResolvedValue({
      id: "wp-1",
      status: WorkPlanStatus.APPROVED,
    } as never);
    prismaMock.generatedDocument.findFirst.mockResolvedValue(null);

    const result = await reviewWorkPlan("wp-1", "APPROVE", undefined, {
      id: "coordinator-1",
      role: Role.DEPARTMENT_COORDINATOR,
    });

    expect(result.status).toBe(WorkPlanStatus.APPROVED);
  });

  it("queues a draft endorsement letter on approval (FR-WP-05)", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      id: "wp-1",
      studentProfileId: "profile-1",
      status: WorkPlanStatus.SUBMITTED,
    } as never);
    prismaMock.workPlan.update.mockResolvedValue({
      id: "wp-1",
      status: WorkPlanStatus.APPROVED,
    } as never);
    prismaMock.generatedDocument.findFirst.mockResolvedValue(null);

    await reviewWorkPlan("wp-1", "APPROVE", undefined, adminUser);

    expect(prismaMock.generatedDocument.create).toHaveBeenCalledWith({
      data: {
        studentProfileId: "profile-1",
        documentType: DocumentType.ENDORSEMENT_LETTER,
        status: DocumentStatus.PENDING_DRAFT,
      },
    });
  });

  it("does not queue a second letter if one is already pending (idempotent)", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      id: "wp-2",
      studentProfileId: "profile-1",
      status: WorkPlanStatus.SUBMITTED,
    } as never);
    prismaMock.workPlan.update.mockResolvedValue({
      id: "wp-2",
      status: WorkPlanStatus.APPROVED,
    } as never);
    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: "doc-1" } as never);

    await reviewWorkPlan("wp-2", "APPROVE", undefined, adminUser);

    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
  });

  it("does not queue a letter on RETURN", async () => {
    prismaMock.workPlan.findUniqueOrThrow.mockResolvedValue({
      id: "wp-1",
      studentProfileId: "profile-1",
      status: WorkPlanStatus.SUBMITTED,
    } as never);
    prismaMock.workPlan.update.mockResolvedValue({
      id: "wp-1",
      status: WorkPlanStatus.RETURNED,
    } as never);

    await reviewWorkPlan("wp-1", "RETURN", "please revise", adminUser);

    expect(prismaMock.generatedDocument.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "WORK_PLAN_RETURNED" }) })
    );
  });
});

describe("read primitives", () => {
  it("getLatestWorkPlanForStudent orders by createdAt descending", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue(null);

    await getLatestWorkPlanForStudent("profile-1");

    expect(prismaMock.workPlan.findFirst).toHaveBeenCalledWith({
      where: { studentProfileId: "profile-1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("getLatestApprovedWorkPlanForStudent filters to APPROVED only", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue(null);

    await getLatestApprovedWorkPlanForStudent("profile-1");

    expect(prismaMock.workPlan.findFirst).toHaveBeenCalledWith({
      where: { studentProfileId: "profile-1", status: WorkPlanStatus.APPROVED },
      orderBy: { createdAt: "desc" },
    });
  });

  it("getWorkPlanHistory returns every row for the student", async () => {
    prismaMock.workPlan.findMany.mockResolvedValue([]);

    await getWorkPlanHistory("profile-1");

    expect(prismaMock.workPlan.findMany).toHaveBeenCalledWith({
      where: { studentProfileId: "profile-1" },
      orderBy: { createdAt: "desc" },
    });
  });
});
