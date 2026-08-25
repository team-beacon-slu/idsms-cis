import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { MoaStatus, Role } from "@prisma/client";
import {
  InvalidMoaTransitionError,
  createCompany,
  createMoaRecord,
  getCompany,
  getExpiringMoaRecords,
  listCompanies,
  listMoaRecordsForCompany,
  setCompanyVerified,
  updateCompany,
  updateMoaRecordStatus,
} from "@/lib/services/companyService";

beforeEach(() => {
  resetPrismaMock();
});

describe("createCompany", () => {
  it("links a student caller to their own profile without needing linkToStudentProfileId", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue({ id: "profile-1" } as never);
    prismaMock.company.create.mockResolvedValue({ id: "company-1" } as never);

    await createCompany(
      {
        name: "Acme",
        address: "123 St",
        workModality: "ON_SITE",
        supervisorName: "Jane",
        supervisorContact: "jane@acme.test",
      },
      { id: "student-1", role: Role.STUDENT_INTERN }
    );

    expect(prismaMock.studentProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { companyId: "company-1", positionTitle: undefined },
    });
  });

  it("does not link anything for a student with no existing profile", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(null);
    prismaMock.company.create.mockResolvedValue({ id: "company-1" } as never);

    await createCompany(
      {
        name: "Acme",
        address: "123 St",
        workModality: "ON_SITE",
        supervisorName: "Jane",
        supervisorContact: "jane@acme.test",
      },
      { id: "student-1", role: Role.STUDENT_INTERN }
    );

    expect(prismaMock.studentProfile.update).not.toHaveBeenCalled();
  });

  it("links a staff-supplied studentProfileId after an ownership check", async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue({
      userId: "student-owner",
      classGroupId: "class-1",
      semesterId: "semester-1",
    } as never);
    prismaMock.company.create.mockResolvedValue({ id: "company-1" } as never);

    await createCompany(
      {
        name: "Acme",
        address: "123 St",
        workModality: "ON_SITE",
        supervisorName: "Jane",
        supervisorContact: "jane@acme.test",
        linkToStudentProfileId: "profile-1",
      },
      { id: "coordinator-1", role: Role.DEPARTMENT_COORDINATOR }
    );

    expect(prismaMock.studentProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { companyId: "company-1", positionTitle: undefined },
    });
  });

  it("logs a COMPANY_CREATED audit event", async () => {
    prismaMock.company.create.mockResolvedValue({ id: "company-1" } as never);

    await createCompany(
      {
        name: "Acme",
        address: "123 St",
        workModality: "ON_SITE",
        supervisorName: "Jane",
        supervisorContact: "jane@acme.test",
      },
      { id: "admin-1", role: Role.SUPER_ADMIN }
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "COMPANY_CREATED", entityId: "company-1" }),
      })
    );
  });
});

describe("updateCompany", () => {
  it("updates the given fields and logs COMPANY_UPDATED", async () => {
    prismaMock.company.update.mockResolvedValue({ id: "company-1", name: "New name" } as never);

    const result = await updateCompany("company-1", { name: "New name" }, "admin-1");

    expect(result.name).toBe("New name");
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "COMPANY_UPDATED" }) })
    );
  });
});

describe("setCompanyVerified", () => {
  it("logs COMPANY_VERIFIED when verifying", async () => {
    prismaMock.company.update.mockResolvedValue({ id: "company-1", isVerified: true } as never);

    await setCompanyVerified("company-1", true, "admin-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "COMPANY_VERIFIED" }) })
    );
  });

  it("logs COMPANY_UNVERIFIED when unverifying", async () => {
    prismaMock.company.update.mockResolvedValue({ id: "company-1", isVerified: false } as never);

    await setCompanyVerified("company-1", false, "admin-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "COMPANY_UNVERIFIED" }) })
    );
  });
});

describe("listCompanies", () => {
  it("excludes soft-deleted companies and applies no search filter by default", async () => {
    prismaMock.company.findMany.mockResolvedValue([]);

    await listCompanies();

    expect(prismaMock.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } })
    );
  });

  it("applies a case-insensitive name search when provided", async () => {
    prismaMock.company.findMany.mockResolvedValue([]);

    await listCompanies({ search: "acme" });

    expect(prismaMock.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, name: { contains: "acme", mode: "insensitive" } },
      })
    );
  });
});

describe("getCompany", () => {
  it("returns the company by id", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-1" } as never);

    const result = await getCompany("company-1");

    expect(result?.id).toBe("company-1");
  });
});

describe("createMoaRecord", () => {
  it("passes an explicit id through when supplied (upload-then-create path)", async () => {
    prismaMock.moaRecord.create.mockResolvedValue({ id: "moa-1" } as never);

    await createMoaRecord(
      {
        id: "moa-1",
        companyId: "company-1",
        documentPath: "company-1/moa-1.pdf",
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2027-01-01"),
        programsCovered: ["BSIT"],
      },
      "faculty-1"
    );

    expect(prismaMock.moaRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: "moa-1" }) })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "MOA_CREATED" }) })
    );
  });
});

describe("updateMoaRecordStatus", () => {
  it("allows a transition on the allow-list", async () => {
    prismaMock.moaRecord.findUniqueOrThrow.mockResolvedValue({
      id: "moa-1",
      status: MoaStatus.DRAFTING,
    } as never);
    prismaMock.moaRecord.update.mockResolvedValue({
      id: "moa-1",
      status: MoaStatus.PENDING,
    } as never);

    const result = await updateMoaRecordStatus("moa-1", MoaStatus.PENDING, "faculty-1");

    expect(result.status).toBe(MoaStatus.PENDING);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "MOA_STATUS_CHANGED",
          detail: { from: MoaStatus.DRAFTING, to: MoaStatus.PENDING },
        }),
      })
    );
  });

  it("rejects a transition that skips lifecycle stages", async () => {
    prismaMock.moaRecord.findUniqueOrThrow.mockResolvedValue({
      id: "moa-1",
      status: MoaStatus.DRAFTING,
    } as never);

    await expect(
      updateMoaRecordStatus("moa-1", MoaStatus.APPROVED_ACTIVE, "faculty-1")
    ).rejects.toThrow(InvalidMoaTransitionError);
    expect(prismaMock.moaRecord.update).not.toHaveBeenCalled();
  });

  it("rejects any transition out of the terminal ARCHIVED state", async () => {
    prismaMock.moaRecord.findUniqueOrThrow.mockResolvedValue({
      id: "moa-1",
      status: MoaStatus.ARCHIVED,
    } as never);

    await expect(
      updateMoaRecordStatus("moa-1", MoaStatus.APPROVED_ACTIVE, "faculty-1")
    ).rejects.toThrow(InvalidMoaTransitionError);
  });
});

describe("listMoaRecordsForCompany", () => {
  it("orders by validTo descending", async () => {
    prismaMock.moaRecord.findMany.mockResolvedValue([]);

    await listMoaRecordsForCompany("company-1");

    expect(prismaMock.moaRecord.findMany).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      orderBy: { validTo: "desc" },
    });
  });
});

describe("getExpiringMoaRecords", () => {
  it("only returns active MOAs expiring within the given window", async () => {
    prismaMock.moaRecord.findMany.mockResolvedValue([]);

    await getExpiringMoaRecords(30);

    expect(prismaMock.moaRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: MoaStatus.APPROVED_ACTIVE }),
      })
    );
  });
});
