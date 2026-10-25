"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendJson } from "@/lib/utils/sendJson";
import type { getAiPanel } from "@/lib/ai/jobs";
import type { AiConnection } from "@/lib/ai/connections";

type Panel = Awaited<ReturnType<typeof getAiPanel>>;
const pct = (n: number) => `${Math.round(n * 100)}%`;

const EMPTY: AiConnection = {
  name: "",
  provider: "openai",
  baseUrl: "",
  keyEnv: "",
  embeddingModel: "",
  chatModel: "",
};

function ConnectionFields({
  slot,
  title,
  hint,
  value,
  onChange,
}: {
  slot: string;
  title: string;
  hint: string;
  value: AiConnection | null;
  onChange: (c: AiConnection | null) => void;
}) {
  const c = value ?? EMPTY;
  const set = (patch: Partial<AiConnection>) => onChange({ ...c, ...patch });
  const field = (key: keyof AiConnection, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label htmlFor={`${slot}-${key}`}>{label}</Label>
      <Input
        id={`${slot}-${key}`}
        value={(c[key] as string | undefined) ?? ""}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </div>
  );
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value !== null}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? {
                    ...EMPTY,
                    provider: "gemini",
                    name: "Gemini",
                    keyEnv: "GEMINI_API_KEY",
                    embeddingModel: "gemini-embedding-001",
                    chatModel: "gemini-3.8-flash",
                  }
                : null
            )
          }
        />
        Use a connection here
      </label>
      {value && (
        <div className="grid gap-3 sm:grid-cols-2">
          {field("name", "Name", "Gemini, or Lab Ollama")}
          <div className="space-y-1">
            <Label htmlFor={`${slot}-provider`}>Kind</Label>
            <select
              id={`${slot}-provider`}
              value={c.provider}
              onChange={(e) => set({ provider: e.target.value as AiConnection["provider"] })}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="gemini">Gemini API</option>
              <option value="openai">OpenAI-compatible (Ollama, vLLM, Groq, OpenRouter…)</option>
            </select>
          </div>
          {c.provider === "openai" && field("baseUrl", "Base URL", "http://ollama:11434/v1")}
          {field("keyEnv", "Key's variable on the server", "GEMINI_API_KEY (blank for Ollama)")}
          {field("embeddingModel", "Embedding model (768 dims)", "gemini-embedding-001")}
          {field("chatModel", "Chat model", "gemini-3.8-flash")}
        </div>
      )}
    </fieldset>
  );
}

// R1 + R2 on one card: the plug-and-play connections and the transparency panel.
export function AiPanel({ panel }: { panel: Panel }) {
  const router = useRouter();
  const [general, setGeneral] = useState(panel.connections.general);
  const [priv, setPriv] = useState(panel.connections.private);
  const [busy, setBusy] = useState(false);

  async function call(method: string, body: unknown, done: string) {
    setBusy(true);
    const res = await sendJson("/api/config/ai", { method, body });
    setBusy(false);
    if (!res.ok) {
      toast.error(
        (res.body.issues as { message: string }[] | undefined)?.[0]?.message ?? res.error
      );
      return;
    }
    toast.success(done);
    router.refresh();
  }

  const reembedNeeded = panel.rows.some((r) => /re-embed/.test(r.reason));
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Connections</h3>
        <p className="text-sm text-muted-foreground">
          Plug in any AI service. The key itself stays on the server: name the environment variable
          that holds it (it must end in _API_KEY). Jobs that read interns&apos; words use only the
          second connection, and never fall back to the first.
        </p>
        <ConnectionFields
          slot="general"
          title="General: public text only"
          hint="The help assistant and duplicate company names."
          value={general}
          onChange={setGeneral}
        />
        <ConnectionFields
          slot="private"
          title="Allowed to read interns' words"
          hint="Copy detection, search, plan coverage, tone, summary and the clarity coach. On the lab server: a model on SLU hardware. On the beta: Gemini (DPO-approved for testers)."
          value={priv}
          onChange={setPriv}
        />
        <Button
          disabled={busy}
          className="cursor-pointer"
          onClick={() =>
            call("PATCH", { connections: { general, private: priv } }, "Connections saved")
          }
        >
          Save connections
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">What is on, and why</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              className="cursor-pointer"
              onClick={() => call("POST", { runTest: true }, "Golden-set test finished")}
            >
              Run the copy-detection test
            </Button>
            {reembedNeeded && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                className="cursor-pointer"
                onClick={() =>
                  call("POST", { reembed: true }, "Re-embedding starts with tonight's run")
                }
              >
                Re-embed all entries
              </Button>
            )}
          </div>
        </div>
        {panel.lastEval && (
          <p className="text-sm text-muted-foreground">
            Copy-detection test on {panel.lastEval.model ?? "an unknown model"}: precision{" "}
            {pct(panel.lastEval.precision)}, recall {pct(panel.lastEval.recall)} on{" "}
            {panel.lastEval.pairCount} pairs ({panel.lastEval.passes ? "passes" : "does not pass"}:
            needs 80% and 70%).
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Job</th>
                <th className="py-2 pr-3 font-medium">Model</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Not right</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {panel.rows.map((r) => (
                <tr key={r.job} className="border-b align-top last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{r.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.reads === "intern" ? "reads interns' words" : "public text"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {r.connection
                      ? `${r.connection.name}: ${r.job === "copy" || r.job === "search" || r.job === "coverage" ? r.connection.embeddingModel : r.connection.chatModel}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={r.on ? "text-success-700 font-medium" : "text-foreground/85"}>
                      {r.on ? "On" : r.reason}
                    </span>
                    {r.offAt && (
                      <span className="block text-xs text-muted-foreground">
                        since {new Date(r.offAt).toLocaleDateString("en-PH")}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {r.ratings.count ? `${r.ratings.notRight} of ${r.ratings.count}` : "no ratings"}
                  </td>
                  <td className="py-2 text-right">
                    {r.switchedOff && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className="cursor-pointer"
                        onClick={() => call("PATCH", { reenable: r.job }, `${r.label} is back on`)}
                      >
                        Re-enable after re-test
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          A job switches itself off when 30% or more of its last 50 ratings (at least 20) are Not
          right, and pauses until the next night after 3 failed calls in a row or a nightly run with
          over 20% failures. Administrators get a notification and an email either way.
        </p>
      </section>
    </div>
  );
}
