import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { AiConfigError, previewThreshold, setAiEnabled, setThreshold } from "@/lib/ai/admin";

beforeEach(() => resetPrismaMock());

const scores = [...Array(15)]
  .map(() => ({ score: 0.9, label: "DUPLICATE" }))
  .concat([...Array(15)].map(() => ({ score: 0.3, label: "BOILERPLATE" })));

function mockConfig(entries: Record<string, unknown>) {
  prismaMock.systemConfig.findMany.mockResolvedValue(
    Object.entries(entries).map(([configKey, configValue]) => ({ configKey, configValue })) as never
  );
  prismaMock.systemConfig.findUnique.mockImplementation((({
    where,
  }: {
    where: { configKey: string };
  }) =>
    Promise.resolve(
      where.configKey in entries ? { configValue: entries[where.configKey] } : null
    )) as never);
}

it("previews precision/recall at a new threshold without calling the model", async () => {
  mockConfig({ "ai:golden_scores": scores });
  const r = await previewThreshold(0.8);
  expect(r).toEqual(
    expect.objectContaining({ threshold: 0.8, precision: 1, recall: 1, passes: true })
  );
});

it("rejects an out-of-range threshold", async () => {
  mockConfig({ "ai:golden_scores": scores });
  await expect(setThreshold(0.95, "admin-1")).rejects.toThrow(AiConfigError);
  await expect(setThreshold(0.5, "admin-1")).rejects.toThrow(AiConfigError);
  expect(prismaMock.systemConfig.upsert).not.toHaveBeenCalled();
});

it("records the threshold change with its precision/recall in the audit log (NFR-AI-03)", async () => {
  mockConfig({ "ai:golden_scores": scores });
  await setThreshold(0.75, "admin-1");
  expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: "AI_THRESHOLD_CHANGED",
        detail: expect.objectContaining({ threshold: 0.75, precision: 1, recall: 1 }),
      }),
    })
  );
});

it("refuses to enable AI without a privacy approval", async () => {
  mockConfig({ "ai:last_eval": { threshold: 0.7, passes: true } });
  await expect(setAiEnabled(true, null, "admin-1")).rejects.toThrow(/privacy/i);
});

it("refuses to enable AI without a passing evaluation at the current threshold", async () => {
  mockConfig({ "ai:last_eval": { threshold: 0.7, passes: false } });
  await expect(setAiEnabled(true, "Prof. Fernandez", "admin-1")).rejects.toThrow(
    /precision|evaluation/i
  );
});

it("can always disable AI", async () => {
  mockConfig({});
  await expect(setAiEnabled(false, null, "admin-1")).resolves.toBeUndefined();
});
