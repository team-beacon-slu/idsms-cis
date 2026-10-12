import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { logEvent } from "@/lib/services/auditService";
import { notify } from "@/lib/services/notify";
import { deleteObject, StorageDeleteError } from "@/lib/storage";
import { ComplianceNotFoundError, RetentionStateError } from "@/lib/errors/compliance";
import {
  RETENTION_LAST_SCAN_KEY,
  deleteRetentionFlaggedFile,
  keepRetentionFlag,
  listPendingRetentionFlags,
  runRetentionScan,
} from "@/lib/services/retentionService";

jest.mock("@/lib/services/auditService", () => ({ logEvent: jest.fn() }));
jest.mock("@/lib/services/notify", () => ({
  notify: jest.fn().mockResolvedValue({ inApp: 1, emailed: 0, failed: 0 }),
}));
jest.mock("@/lib/services/notificationRecipients", () => ({
  getSuperAdminIds: jest.fn().mockResolvedValue(["sa-1"]),
}));
jest.mock("@/lib/storage", () => ({
  CHECKLIST_BUCKET: "checklist-documents",
  GENERATED_DOCUMENTS_BUCKET: "generated-documents",
  deleteObject: jest.fn(),
  StorageDeleteError: class StorageDeleteError extends Error {
    name = "StorageDeleteError";
  },
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-12T00:00:00Z");

function candidates(opts: { item?: boolean; proof?: string | null; doc?: boolean } = {}) {
  const semester = { endDate: new Date("2023-01-01T00:00:00Z") };
  prismaMock.preDeploymentChecklistItem.findMany.mockResolvedValue(
    (opts.item === false
      ? []
      : [
          { id: "i-1", filePath: "c/1.pdf", studentProfileId: "p-1", studentProfile: { semester } },
        ]) as never
  );
  prismaMock.deviationReport.findMany.mockResolvedValue(
    (opts.proof === undefined || opts.proof === null
      ? []
      : [
          {
            id: "d-1",
            proofUrl: opts.proof,
            studentProfileId: "p-1",
            studentProfile: { semester },
          },
        ]) as never
  );
  prismaMock.generatedDocument.findMany.mockResolvedValue(
    (opts.doc
      ? [{ id: "g-1", fileUrl: "g/1.pdf", studentProfileId: "p-1", studentProfile: { semester } }]
      : []) as never
  );
}

beforeEach(() => {
  resetPrismaMock();
  jest.mocked(logEvent).mockReset();
  jest.mocked(notify).mockClear();
  jest.mocked(deleteObject).mockReset();
  prismaMock.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) =>
    fn(prismaMock)) as never);
  prismaMock.systemConfig.findUnique.mockResolvedValue(null);
  prismaMock.retentionFlag.findMany.mockResolvedValue([] as never);
});

describe("runRetentionScan", () => {
  it("is skipped when the last scan was 30 days ago", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue({
      configValue: new Date(NOW.getTime() - 30 * DAY).toISOString(),
    } as never);
    expect(await runRetentionScan(NOW)).toEqual({ ran: false, flagged: 0 });
    expect(prismaMock.preDeploymentChecklistItem.findMany).not.toHaveBeenCalled();
  });

  it("runs when the key is missing", async () => {
    candidates({ item: false });
    expect((await runRetentionScan(NOW)).ran).toBe(true);
  });

  it("runs when the last scan was 91 days ago", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue({
      configValue: new Date(NOW.getTime() - 91 * DAY).toISOString(),
    } as never);
    candidates({ item: false });
    expect((await runRetentionScan(NOW)).ran).toBe(true);
  });

  it("uses a calendar-year cutoff: now minus 3 years, strict less-than", async () => {
    candidates({ item: false });
    await runRetentionScan(NOW);
    const cutoff = new Date("2023-10-12T00:00:00Z");
    const where = prismaMock.preDeploymentChecklistItem.findMany.mock.calls[0][0]!.where;
    expect(where).toEqual({
      filePath: { not: null },
      studentProfile: { semester: { endDate: { lt: cutoff } } },
    });
  });

  it("flags a candidate with update: {} and PENDING create, then records the scan", async () => {
    candidates({ doc: true, proof: "deviations/p-1/x.pdf" });
    const res = await runRetentionScan(NOW);
    expect(res).toEqual({ ran: true, flagged: 3 });
    expect(prismaMock.retentionFlag.upsert).toHaveBeenCalledTimes(3);
    expect(prismaMock.retentionFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceType_sourceId: { sourceType: "GENERATED_DOCUMENT", sourceId: "g-1" } },
        create: expect.objectContaining({
          bucket: "generated-documents",
          objectPath: "g/1.pdf",
          status: "PENDING",
        }),
        update: {},
      })
    );
    expect(prismaMock.retentionFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceType: "DEVIATION_PROOF",
          bucket: "checklist-documents",
        }),
      })
    );
    expect(prismaMock.systemConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { configKey: RETENTION_LAST_SCAN_KEY },
        update: { configValue: NOW.toISOString() },
      })
    );
    expect(logEvent).toHaveBeenCalledWith({
      userId: null,
      action: "RETENTION_SCAN",
      entityType: "RetentionFlag",
      detail: { flagged: 3 },
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ["sa-1"],
        trigger: "RETENTION_REVIEW",
        title: "Files due for retention review",
        body: "3 files are more than 3 years past their semester. Review them in the Export Center.",
        link: "/admin/export-center#retention",
      })
    );
  });

  it("skips external https deviation proofs", async () => {
    candidates({ item: false, proof: "https://example.com/proof.pdf" });
    expect((await runRetentionScan(NOW)).flagged).toBe(0);
    expect(prismaMock.retentionFlag.upsert).not.toHaveBeenCalled();
  });

  it("reports 0 and sends no notification when every key already exists", async () => {
    candidates({});
    prismaMock.retentionFlag.findMany.mockResolvedValue([
      { sourceType: "CHECKLIST", sourceId: "i-1" },
    ] as never);
    expect(await runRetentionScan(NOW)).toEqual({ ran: true, flagged: 0 });
    expect(notify).not.toHaveBeenCalled();
    expect(prismaMock.retentionFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} })
    );
  });

  it("never deletes storage objects or rows", async () => {
    candidates({ doc: true });
    await runRetentionScan(NOW);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(prismaMock.retentionFlag.delete).not.toHaveBeenCalled();
    expect(prismaMock.retentionFlag.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.preDeploymentChecklistItem.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.preDeploymentChecklistItem.updateMany).not.toHaveBeenCalled();
  });
});

const flag = (over: Record<string, unknown> = {}) => ({
  id: "f-1",
  bucket: "checklist-documents",
  objectPath: "c/1.pdf",
  sourceType: "CHECKLIST",
  sourceId: "i-1",
  status: "PENDING",
  ...over,
});

describe("keepRetentionFlag", () => {
  it("404s on an unknown id", async () => {
    prismaMock.retentionFlag.findUnique.mockResolvedValue(null);
    await expect(keepRetentionFlag("f-1", "a-1")).rejects.toThrow(ComplianceNotFoundError);
  });

  it("rejects a flag that is not PENDING", async () => {
    prismaMock.retentionFlag.findUnique.mockResolvedValue(flag({ status: "KEPT" }) as never);
    await expect(keepRetentionFlag("f-1", "a-1")).rejects.toThrow(RetentionStateError);
    await expect(keepRetentionFlag("f-1", "a-1")).rejects.toThrow("This file was already reviewed");
  });

  it("marks KEPT and logs RETENTION_KEPT in the transaction", async () => {
    prismaMock.retentionFlag.findUnique.mockResolvedValue(flag() as never);
    prismaMock.retentionFlag.updateMany.mockResolvedValue({ count: 1 } as never);
    await keepRetentionFlag("f-1", "a-1");
    expect(prismaMock.retentionFlag.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f-1", status: "PENDING" },
        data: expect.objectContaining({ status: "KEPT", reviewedBy: "a-1" }),
      })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RETENTION_KEPT", entityId: "f-1" }),
      prismaMock
    );
  });

  it("rejects without auditing when a concurrent review won the race (count 0)", async () => {
    prismaMock.retentionFlag.findUnique.mockResolvedValue(flag() as never);
    prismaMock.retentionFlag.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(keepRetentionFlag("f-1", "a-1")).rejects.toThrow("This file was already reviewed");
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe("deleteRetentionFlaggedFile", () => {
  it("404s / 409s before touching storage", async () => {
    prismaMock.retentionFlag.findUnique.mockResolvedValue(null);
    await expect(deleteRetentionFlaggedFile("f-1", "a-1", null)).rejects.toThrow(
      ComplianceNotFoundError
    );
    prismaMock.retentionFlag.findUnique.mockResolvedValue(flag({ status: "DELETED" }) as never);
    await expect(deleteRetentionFlaggedFile("f-1", "a-1", null)).rejects.toThrow(
      RetentionStateError
    );
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it.each([
    ["CHECKLIST", "preDeploymentChecklistItem", { filePath: null }],
    ["DEVIATION_PROOF", "deviationReport", { proofUrl: null }],
    ["GENERATED_DOCUMENT", "generatedDocument", { fileUrl: null }],
  ] as const)("deletes the object then nulls the %s column", async (sourceType, model, data) => {
    prismaMock.retentionFlag.findUnique.mockResolvedValue(flag({ sourceType }) as never);
    jest.mocked(deleteObject).mockResolvedValue(undefined);
    await deleteRetentionFlaggedFile("f-1", "a-1", "10.0.0.1");
    expect(deleteObject).toHaveBeenCalledWith("checklist-documents", "c/1.pdf");
    expect(prismaMock[model].updateMany).toHaveBeenCalledWith({ where: { id: "i-1" }, data });
    expect(prismaMock.retentionFlag.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DELETED" }) })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "FILE_DELETED",
        entityType: "RetentionFlag",
        entityId: "f-1",
        ipAddress: "10.0.0.1",
        detail: {
          bucket: "checklist-documents",
          objectPath: "c/1.pdf",
          sourceType,
          sourceId: "i-1",
        },
      }),
      prismaMock
    );
  });

  it("succeeds when the object was already gone (deleteObject resolves)", async () => {
    prismaMock.retentionFlag.findUnique.mockResolvedValue(flag() as never);
    jest.mocked(deleteObject).mockResolvedValue(undefined);
    await expect(deleteRetentionFlaggedFile("f-1", "a-1", null)).resolves.toBeUndefined();
    expect(prismaMock.retentionFlag.update).toHaveBeenCalled();
  });

  it("leaves the flag PENDING and rethrows on StorageDeleteError", async () => {
    prismaMock.retentionFlag.findUnique.mockResolvedValue(flag() as never);
    jest.mocked(deleteObject).mockRejectedValue(new StorageDeleteError("storage down"));
    await expect(deleteRetentionFlaggedFile("f-1", "a-1", null)).rejects.toThrow("storage down");
    expect(prismaMock.retentionFlag.update).not.toHaveBeenCalled();
    expect(prismaMock.preDeploymentChecklistItem.updateMany).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe("listPendingRetentionFlags", () => {
  it("joins student numbers", async () => {
    const d = new Date("2023-01-01T00:00:00Z");
    prismaMock.retentionFlag.findMany.mockResolvedValue([
      {
        id: "f-1",
        sourceType: "CHECKLIST",
        studentProfileId: "p-1",
        semesterEndDate: d,
        flaggedAt: d,
      },
    ] as never);
    prismaMock.studentProfile.findMany.mockResolvedValue([
      { id: "p-1", studentNumber: "2020-0001" },
    ] as never);
    expect(await listPendingRetentionFlags()).toEqual([
      {
        id: "f-1",
        sourceType: "CHECKLIST",
        studentNumber: "2020-0001",
        semesterEndDate: d,
        flaggedAt: d,
      },
    ]);
  });
});
