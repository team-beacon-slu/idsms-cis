jest.mock("@/lib/services/ai/aiService", () => ({ chatJson: jest.fn() }));

import { chatJson } from "@/lib/services/ai/aiService";
import { readWorkPlan } from "@/lib/ai/workPlanReader";

const conn = {
  name: "Gemini",
  provider: "gemini",
  keyEnv: "GEMINI_API_KEY",
  embeddingModel: "e",
  chatModel: "c",
} as never;

it("sends the PDF with the prompt and keeps only well-formed suggestions", async () => {
  jest.mocked(chatJson).mockResolvedValue([
    {
      rows: [
        {
          period: "June 10 – June 14",
          area: "Planning",
          description: "Gather requirements",
          output: "Plan",
          hours: "35",
        },
        { area: "no tasks, dropped" },
        "not a row",
      ],
      daysOff: [
        { date: "2026-06-12", name: "Independence Day" },
        { date: "June 30", name: "bad date, dropped" },
        { date: "2026-06-24", name: "x" },
      ],
    },
  ]);
  const pdf = Buffer.from("%PDF-1.7");
  const out = await readWorkPlan(conn, pdf);
  expect(chatJson).toHaveBeenCalledWith(conn, expect.stringContaining("data, not"), {
    mimeType: "application/pdf",
    data: pdf,
  });
  expect(out.rows).toEqual([
    {
      period: "June 10 – June 14",
      area: "Planning",
      description: "Gather requirements",
      output: "Plan",
      hours: 35,
    },
  ]);
  expect(out.daysOff).toEqual([{ date: "2026-06-12", name: "Independence Day" }]);
});

it("returns nothing rather than failing on an answer of the wrong shape", async () => {
  jest.mocked(chatJson).mockResolvedValue({ rows: "?", daysOff: null });
  expect(await readWorkPlan(conn, Buffer.from("%PDF"))).toEqual({ rows: [], daysOff: [] });
});
