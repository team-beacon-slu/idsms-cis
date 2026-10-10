import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { DocumentStatus, DocumentType, Role, WorkPlanStatus } from "@prisma/client";
import {
  WorkPlanPendingError,
  getLatestApprovedWorkPlanForStudent,
  getLatestWorkPlanForStudent,
  getWorkPlanHistory,
  reviewWorkPlan,
  submitWorkPlan,
} from "@/lib/services/workPlanService";
import { ForbiddenError } from "@/lib/services/userService";

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
