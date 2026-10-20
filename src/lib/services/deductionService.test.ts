import { ZodError } from "zod";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { DEFAULT_MATRIX } from "@/lib/utils/deductionMatrix";
import {
  getDefaultConductHours,
  getDeductionMatrix,
  setDeductionMatrix,
  setDefaultConductHours,
} from "@/lib/services/deductionService";

beforeEach(() => resetPrismaMock());

describe("deduction matrix config", () => {
  it("falls back to SLU's defaults when unset or invalid", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    await expect(getDeductionMatrix()).resolves.toEqual(DEFAULT_MATRIX);
    prismaMock.systemConfig.findUnique.mockResolvedValue({ configValue: [{ bad: true }] } as never);
    await expect(getDeductionMatrix()).resolves.toEqual(DEFAULT_MATRIX);
  });

  it("returns the stored matrix", async () => {
    const edited = [{ ...DEFAULT_MATRIX[1], tiers: [{ count: 1, adviser: 1, wwr: 1 }] }];
    prismaMock.systemConfig.findUnique.mockResolvedValue({ configValue: edited } as never);
    await expect(getDeductionMatrix()).resolves.toEqual(edited);
  });

  it("validates, stores and audits an edit", async () => {
    prismaMock.systemConfig.upsert.mockResolvedValue({ id: "cfg-1" } as never);
    await setDeductionMatrix(DEFAULT_MATRIX, "admin-1");
    expect(prismaMock.systemConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { configKey: "deduction_matrix" } })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DEDUCTION_MATRIX_UPDATED" }),
      })
    );
    await expect(setDeductionMatrix([{ key: "x" }], "admin-1")).rejects.toThrow(ZodError);
  });
});

describe("default hours per conduct record", () => {
  it("defaults to 0 and stores 0–40", async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue(null);
    await expect(getDefaultConductHours()).resolves.toBe(0);
    prismaMock.systemConfig.upsert.mockResolvedValue({ id: "cfg-2" } as never);
    await setDefaultConductHours(4, "admin-1");
    expect(prismaMock.systemConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ configValue: 4 }) })
    );
    await expect(setDefaultConductHours(41, "admin-1")).rejects.toThrow(ZodError);
  });
});
