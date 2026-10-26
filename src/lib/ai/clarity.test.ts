import { vagueDays } from "@/lib/ai/clarity";

describe("clarity coach rules", () => {
  it("asks about short and generic days, in English and Taglish", () => {
    const out = vagueDays([
      { id: "a", text: "Did my tasks." },
      { id: "b", text: "Same lang kahapon, tumulong lang sa office." },
      {
        id: "c",
        text: "Configured three VLANs on the core switch and documented the port map for IT.",
        tools: "Cisco IOS",
      },
    ]);
    expect(out.map((d) => d.id)).toEqual(["a", "b"]);
    expect(out[0].questions).toEqual(["task", "result"]);
  });

  it("flags the same text written on two days", () => {
    const text = "Encoded the delivery receipts into the inventory system for the warehouse.";
    const out = vagueDays([
      { id: "a", text, tools: "Excel" },
      { id: "b", text, tools: "Excel" },
    ]);
    expect(out.map((d) => d.id)).toEqual(["a", "b"]);
    expect(out[0].questions).toEqual(["task"]);
  });

  it("asks at most two questions and skips empty days", () => {
    const out = vagueDays([
      { id: "a", text: "Assisted." },
      { id: "b", text: "  " },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].questions.length).toBeLessThanOrEqual(2);
  });
});
