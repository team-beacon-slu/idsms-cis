jest.mock("@/lib/services/attendance/attendanceService", () => ({
  calculateRenderedHours: jest.fn(),
}));

import { Prisma, Role } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import { calculateRenderedHours } from "@/lib/services/attendance/attendanceService";
import { CompanyStateError } from "@/lib/services/predeployment/companyService";
import {
  getCompanyFeedback,
  getOwnEvaluationForm,
  setCompanyReply,
  submitCompanyEvaluation,
} from "@/lib/services/predeployment/companyEvaluationService";

const student = { id: "student-1", role: Role.STUDENT_INTERN };
// An FM-VAA-052: 16 obligations and 6 quality items, each 1-4.
const ratings = { obligations: Array(16).fill(3), quality: Array(6).fill(4) };
const evaluation = (comment: string | null) => ({
  ...ratings,
  liked: null,
  improve: null,
  comment,
});

beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  // The intern owns profile-1, placed at Acme, 486 hours required.
  prismaMock.studentProfile.findUnique.mockResolvedValue({
    userId: "student-1",
    classGroupId: "cg-1",
    semesterId: "s-1",
    requiredHours: 486,
    company: { name: "Acme" },
    companyEvaluation: null,
  } as never);
  prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({ companyId: "c-1" } as never);
  prismaMock.companyEvaluation.create.mockResolvedValue({ id: "ev-1" } as never);
  jest.mocked(calculateRenderedHours).mockResolvedValue(486);
});

describe("submitCompanyEvaluation", () => {
  it("records the evaluation against the intern's company once hours are complete", async () => {
    await expect(
      submitCompanyEvaluation("profile-1", { ...ratings, comment: "  ", liked: "Mentors" }, student)
    ).resolves.toEqual({ id: "ev-1" });
    expect(prismaMock.companyEvaluation.create).toHaveBeenCalledWith({
      data: {
        studentProfileId: "profile-1",
        companyId: "c-1",
        ...ratings,
        liked: "Mentors",
        improve: null,
        comment: null,
      },
      select: { id: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("stays closed until every required hour is confirmed", async () => {
    jest.mocked(calculateRenderedHours).mockResolvedValue(485.5);
    await expect(submitCompanyEvaluation("profile-1", ratings, student)).rejects.toThrow(
      CompanyStateError
    );
    expect(prismaMock.companyEvaluation.create).not.toHaveBeenCalled();
  });

  it("allows one evaluation per intern", async () => {
    prismaMock.companyEvaluation.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" })
    );
    await expect(submitCompanyEvaluation("profile-1", ratings, student)).rejects.toThrow(
      "You have already evaluated your company"
    );
  });

  it("needs every item rated on the 1-4 scale", async () => {
    await expect(
      submitCompanyEvaluation("profile-1", { ...ratings, quality: [4, 4, 4] }, student)
    ).rejects.toThrow("Rate all 6 internship-quality items");
    await expect(
      submitCompanyEvaluation("profile-1", { ...ratings, obligations: Array(16).fill(5) }, student)
    ).rejects.toThrow();
    expect(prismaMock.companyEvaluation.create).not.toHaveBeenCalled();
  });

  it("rejects staff and out-of-range ratings", async () => {
    await expect(
      submitCompanyEvaluation("profile-1", ratings, { id: "f-1", role: Role.FACULTY_ADVISER })
    ).rejects.toThrow(ForbiddenError);
    await expect(
      submitCompanyEvaluation("profile-1", { ...ratings, quality: Array(6).fill(0) }, student)
    ).rejects.toThrow();
  });
});

describe("getCompanyFeedback", () => {
  const interns = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `p-${i}`, semester: { name: "1st Sem 2026" } }));

  beforeEach(() => {
    prismaMock.company.findUnique.mockResolvedValue({ hteReply: null, hteReplyAt: null } as never);
  });

  it("hides facts, ratings and comments below 5 interns", async () => {
    prismaMock.studentProfile.findMany.mockResolvedValue(interns(4) as never);
    prismaMock.companyEvaluation.findMany.mockResolvedValue(
      Array.from({ length: 4 }, () => evaluation("Great mentor")) as never
    );
    const view = await getCompanyFeedback("c-1");
    expect(view).toMatchObject({ internCount: 4, facts: null, evaluationCount: 4, ratings: null });
    expect(view.placements).toEqual([{ term: "1st Sem 2026", count: 4 }]);
    expect(prismaMock.weeklyReport.findMany).not.toHaveBeenCalled();
  });

  it("pools facts and ratings at 5 interns", async () => {
    prismaMock.studentProfile.findMany.mockResolvedValue(interns(5) as never);
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      { status: "APPROVED", totalHours: 40, revisionHistory: [{ type: "SUBMITTED" }] },
      { status: "APPROVED", totalHours: 36, revisionHistory: [{ type: "SUBMITTED", late: true }] },
      { status: "PENDING", totalHours: 10, revisionHistory: [] },
    ] as never);
    prismaMock.deviationReport.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    prismaMock.companyEvaluation.findMany.mockResolvedValue([
      ...Array.from({ length: 4 }, () => evaluation(null)),
      { ...evaluation("Too few laptops"), quality: [1, 4, 4, 4, 4, 4] },
    ] as never);

    const view = await getCompanyFeedback("c-1");
    expect(view.facts).toEqual({
      averageWeeklyHours: 38,
      onTimeShare: 50,
      overtime: 3,
      absences: 1,
    });
    expect(view.ratings?.count).toBe(5);
    expect(view.ratings?.quality[0].average).toBe(3.4); // (4*4 + 1) / 5
    expect(view.ratings?.quality[0].label).toMatch(/^Quality of supervision/);
    expect(view.ratings?.obligations).toHaveLength(16);
    expect(view.ratings?.comments).toEqual({
      liked: [],
      improve: [],
      comment: ["Too few laptops"],
    });
  });
});

describe("setCompanyReply", () => {
  it("lets the coordinator record the reply and audits it", async () => {
    await setCompanyReply(
      "c-1",
      { reply: "We will assign each intern a named mentor." },
      { id: "co-1", role: Role.DEPARTMENT_COORDINATOR }
    );
    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-1", deletedAt: null } })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("is read-only for faculty advisers", async () => {
    await expect(
      setCompanyReply(
        "c-1",
        { reply: "Some reply text here" },
        { id: "f-1", role: Role.FACULTY_ADVISER }
      )
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("getOwnEvaluationForm", () => {
  it("lets only the intern print their own FM-VAA-052", async () => {
    await expect(
      getOwnEvaluationForm("profile-1", { id: "f-1", role: Role.FACULTY_ADVISER })
    ).rejects.toThrow(ForbiddenError);
  });

  it("dates the internship from the start date to the last report week", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue({
      userId: "student-1",
      classGroupId: "cg-1",
      semesterId: "s-1",
      fullName: null,
      internshipStartDate: null,
      user: { email: "juan.delacruz@slu.edu.ph" },
      companyEvaluation: {
        ...evaluation(null),
        createdAt: new Date("2026-08-29T00:00:00Z"),
        company: { name: "Acme", address: "Baguio", supervisorName: "Maria" },
      },
      weeklyReports: [
        { weekStart: new Date("2026-06-01T00:00:00Z"), weekEnd: new Date("2026-06-07T00:00:00Z") },
        { weekStart: new Date("2026-08-24T00:00:00Z"), weekEnd: new Date("2026-08-30T00:00:00Z") },
      ],
    } as never);
    const form = (await getOwnEvaluationForm("profile-1", student))!;
    expect(form.name).toBe("Delacruz, Juan");
    expect(form.from).toEqual(new Date("2026-06-01T00:00:00Z"));
    expect(form.to).toEqual(new Date("2026-08-30T00:00:00Z"));
  });
});
