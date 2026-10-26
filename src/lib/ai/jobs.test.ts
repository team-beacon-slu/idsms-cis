import "@/testUtils/prismaMock"; // the real client would open a database connection
jest.mock("@/lib/services/notifications/notify", () => ({ notify: jest.fn() }));
import { jobStatus, ratingsVerdict } from "@/lib/ai/jobs";
import { connectionSchema, type AiConnection } from "@/lib/ai/connections";
import { queueReasons } from "@/lib/ai/reviewQueue";

const gemini: AiConnection = {
  name: "Gemini",
  provider: "gemini",
  keyEnv: "GEMINI_API_KEY",
  embeddingModel: "gemini-embedding-001",
  chatModel: "gemini-3.8-flash",
};
const passing = { passes: true, model: "gemini-embedding-001" } as never;
const ctx = (over: Record<string, unknown> = {}) => ({
  settings: { enabled: true, lastEval: passing },
  connections: { general: gemini, private: gemini },
  states: {},
  embeddedWith: null,
  ...over,
});

beforeEach(() => {
  process.env.GEMINI_API_KEY = "k";
});

describe("jobStatus (plug and play)", () => {
  it("runs a job whose connection is set, keyed, tested and unrated", () => {
    expect(jobStatus("copy", ctx()).on).toBe(true);
    expect(jobStatus("help", ctx()).on).toBe(true);
  });

  it("is off everywhere while AI is switched off", () => {
    expect(
      jobStatus("help", ctx({ settings: { enabled: false, lastEval: passing } })).reason
    ).toMatch(/switched off/);
  });

  it("never runs an intern-text job on the general connection (guardrail 1)", () => {
    const s = jobStatus("tone", ctx({ connections: { general: gemini, private: null } }));
    expect(s.on).toBe(false);
    expect(s.reason).toMatch(/interns' words/);
    expect(jobStatus("help", ctx({ connections: { general: gemini, private: null } })).on).toBe(
      true
    );
  });

  it("is off when the key's variable isn't set on the server", () => {
    delete process.env.GEMINI_API_KEY;
    expect(jobStatus("summary", ctx()).reason).toMatch(/GEMINI_API_KEY/);
  });

  it("stays off after ratings switched it off, and while paused", () => {
    expect(
      jobStatus("tone", ctx({ states: { tone: { offReason: "Switched off: 8 of 20" } } })).on
    ).toBe(false);
    const later = new Date(Date.now() + 3_600_000).toISOString();
    expect(jobStatus("tone", ctx({ states: { tone: { pausedUntil: later } } })).reason).toMatch(
      /Paused/
    );
  });

  it("stops embedding jobs when stored vectors came from another model (guardrail 2)", () => {
    expect(jobStatus("search", ctx({ embeddedWith: "nomic-embed-text-v2-moe" })).reason).toMatch(
      /re-embed/
    );
  });

  it("runs copy detection only on a test passed on this model (guardrail 3)", () => {
    const other = { passes: true, model: "text-embedding-004" } as never;
    expect(jobStatus("copy", ctx({ settings: { enabled: true, lastEval: other } })).reason).toMatch(
      /re-run/
    );
    const failing = { passes: false, model: "gemini-embedding-001" } as never;
    expect(jobStatus("copy", ctx({ settings: { enabled: true, lastEval: failing } })).on).toBe(
      false
    );
  });
});

describe("ratingsVerdict (R2)", () => {
  const votes = (right: number, wrong: number) => [
    ...Array(wrong).fill({ correct: false }),
    ...Array(right).fill({ correct: true }),
  ];
  it("switches off at 30% Not right once there are 20 ratings", () => {
    expect(ratingsVerdict(votes(14, 6)).switchOff).toBe(true);
    expect(ratingsVerdict(votes(15, 5)).switchOff).toBe(false);
  });
  it("never decides on fewer than 20 ratings", () => {
    expect(ratingsVerdict(votes(0, 19)).switchOff).toBe(false);
  });
  it("counts only the last 50", () => {
    expect(ratingsVerdict(votes(60, 10)).count).toBe(50);
  });
});

describe("connectionSchema", () => {
  it("accepts a keyless OpenAI-compatible server and a Gemini key variable", () => {
    expect(
      connectionSchema.safeParse({
        name: "Lab",
        provider: "openai",
        baseUrl: "http://ollama:11434/v1",
        keyEnv: "",
        embeddingModel: "nomic-embed-text-v2-moe",
        chatModel: "gemma3:4b",
      }).success
    ).toBe(true);
    expect(connectionSchema.safeParse(gemini).success).toBe(true);
  });
  it("refuses a key variable that could leak another secret", () => {
    for (const keyEnv of ["DATABASE_URL", "NEXTAUTH_SECRET", "SUPABASE_SERVICE_ROLE_KEY"]) {
      expect(connectionSchema.safeParse({ ...gemini, keyEnv }).success).toBe(false);
    }
  });
  it("needs a base URL for an OpenAI-compatible server", () => {
    expect(connectionSchema.safeParse({ ...gemini, provider: "openai" }).success).toBe(false);
  });
});

describe("queueReasons (job 7)", () => {
  const entries = [
    { id: "a", accomplishments: "Did my tasks.", toolsUsed: null },
    {
      id: "b",
      accomplishments: "Configured the VLANs on the core switch and documented the ports.",
      toolsUsed: "Cisco",
    },
  ];
  it("says why a week is near the top, with or without AI", () => {
    const hints = { tone: { entryId: "b", quote: "x" }, addressedToAi: ["a"] };
    const reasons = queueReasons(
      { aiHints: hints, similarityScore: 0.9, dailyEntries: entries },
      { on: new Set(["copy", "tone"] as const), similarityThreshold: 0.7 }
    );
    expect(reasons).toEqual([
      "A day is very similar to an earlier week",
      "An entry is addressed to the AI",
      "A phrase is worth a look",
      "1 vague day",
    ]);
    expect(
      queueReasons(
        { aiHints: hints, similarityScore: 0.9, dailyEntries: entries },
        { on: new Set(), similarityThreshold: 0.7 }
      )
    ).toEqual(["An entry is addressed to the AI", "1 vague day"]);
  });
});
