"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileDown, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTACHMENT_KEYS,
  ATTACHMENT_LABELS,
  SECTION_KEYS,
  SECTION_LABELS,
  sentence,
  type FinalReportContent,
} from "@/lib/validators/finalReport";

// Workstream H — the intern writes the Final Technical Report. Editable while
// Draft or Returned; proof is attached in Google Classroom, not here (D2/D7).

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function FinalReportEditor({
  studentProfileId,
  status,
  content,
  hasPdf,
}: {
  studentProfileId: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED" | null;
  content: FinalReportContent;
  hasPdf: boolean;
}) {
  const router = useRouter();
  const editable = status === null || status === "DRAFT" || status === "RETURNED";
  const [sections, setSections] = useState<Record<string, string>>(
    Object.fromEntries(SECTION_KEYS.map((k) => [k, content.sections[k] ?? ""]))
  );
  const [scores, setScores] = useState({
    supervisorScore: content.supervisorScore?.toString() ?? "",
    supervisorScale: content.supervisorScale?.toString() ?? "5",
    peerScore: content.peerScore?.toString() ?? "",
    peerScale: content.peerScale?.toString() ?? "100",
  });
  const [attachments, setAttachments] = useState<Record<string, boolean>>(
    Object.fromEntries(ATTACHMENT_KEYS.map((k) => [k, Boolean(content.attachments[k])]))
  );
  const [pending, setPending] = useState<"save" | "submit" | "pdf" | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b.issues?.[0]?.message ?? b.error ?? "Something went wrong");
      return false;
    }
    return true;
  }

  const save = () =>
    call(`/api/students/${studentProfileId}/final-report`, "PUT", {
      sections,
      supervisorScore: numOrNull(scores.supervisorScore),
      supervisorScale: numOrNull(scores.supervisorScale),
      peerScore: numOrNull(scores.peerScore),
      peerScale: numOrNull(scores.peerScale),
      attachments,
    });

  async function onSave() {
    setPending("save");
    if (await save()) {
      toast.success("Draft saved");
      router.refresh();
    }
    setPending(null);
  }

  async function onSubmit() {
    setPending("submit");
    if (
      (await save()) &&
      (await call(`/api/students/${studentProfileId}/final-report/submit`, "POST"))
    ) {
      toast.success("Submitted — the coordinator will review it");
      router.refresh();
    }
    setPending(null);
  }

  async function onGeneratePdf() {
    setPending("pdf");
    if (await call(`/api/students/${studentProfileId}/final-report/pdf`, "POST")) {
      toast.success("PDF ready");
      router.refresh();
    }
    setPending(null);
  }

  return (
    <div className="space-y-6">
      {SECTION_KEYS.map((k) => (
        <div key={k} className="space-y-1">
          <Label htmlFor={`fr-${k}`}>{sentence(SECTION_LABELS[k])}</Label>
          <Textarea
            id={`fr-${k}`}
            rows={6}
            maxLength={10000}
            value={sections[k]}
            disabled={!editable || pending !== null}
            onChange={(e) => setSections({ ...sections, [k]: e.target.value })}
          />
        </div>
      ))}

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Evaluation scores</legend>
        <p className="text-xs text-muted-foreground">
          Copy the overall scores from the signed evaluation forms (the forms go to Google
          Classroom).
        </p>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["supervisorScore", "Supervisor score"],
              ["supervisorScale", "out of"],
              ["peerScore", "Peer score"],
              ["peerScale", "out of"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`fr-${key}`}>{label}</Label>
              <Input
                id={`fr-${key}`}
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={scores[key]}
                disabled={!editable || pending !== null}
                onChange={(e) => setScores({ ...scores, [key]: e.target.value })}
                className="w-28"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Attachments in Google Classroom</legend>
        {ATTACHMENT_KEYS.map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={attachments[k]}
              disabled={!editable || pending !== null}
              onChange={(e) => setAttachments({ ...attachments, [k]: e.target.checked })}
            />
            {sentence(ATTACHMENT_LABELS[k])} is attached
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        {editable && (
          <>
            <Button
              variant="outline"
              onClick={onSave}
              disabled={pending !== null}
              className="cursor-pointer gap-1.5"
            >
              <Save className="size-3.5" aria-hidden="true" />
              {pending === "save" ? "Saving…" : "Save draft"}
            </Button>
            <Button
              onClick={onSubmit}
              disabled={pending !== null}
              className="cursor-pointer gap-1.5"
            >
              <Send className="size-3.5" aria-hidden="true" />
              {pending === "submit" ? "Submitting…" : "Submit for review"}
            </Button>
          </>
        )}
        {status === "APPROVED" && (
          <>
            <Button
              onClick={onGeneratePdf}
              disabled={pending !== null}
              className="cursor-pointer gap-1.5"
            >
              <FileDown className="size-3.5" aria-hidden="true" />
              {pending === "pdf" ? "Generating…" : hasPdf ? "Regenerate PDF" : "Generate PDF"}
            </Button>
            {hasPdf && (
              <Button asChild variant="outline" className="cursor-pointer gap-1.5">
                <a href={`/api/students/${studentProfileId}/final-report/pdf`}>
                  <Download className="size-3.5" aria-hidden="true" />
                  Download PDF
                </a>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
