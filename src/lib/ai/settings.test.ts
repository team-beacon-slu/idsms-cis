import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { getAiSettings } from "@/lib/ai/settings";

beforeEach(() => resetPrismaMock());

it("defaults to disabled, 0.70 threshold, 0.60 confidence", async () => {
  prismaMock.systemConfig.findMany.mockResolvedValue([]);
  await expect(getAiSettings()).resolves.toEqual({
    enabled: false,
    similarityThreshold: 0.7,
    minSentimentConfidence: 0.6,
    privacyApprovedBy: null,
    lastEval: null,
  });
});

it("clamps an out-of-range stored threshold back to the default", async () => {
  prismaMock.systemConfig.findMany.mockResolvedValue([
    { configKey: "ai:similarity_threshold", configValue: 0.99 },
    { configKey: "ai:enabled", configValue: true },
  ] as never);
  const s = await getAiSettings();
  expect(s.similarityThreshold).toBe(0.7);
  expect(s.enabled).toBe(true);
});
