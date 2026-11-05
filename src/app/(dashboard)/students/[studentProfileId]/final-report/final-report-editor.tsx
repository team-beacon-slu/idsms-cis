"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { useFormDraft } from "@/lib/utils/formDraft";
import { Download, FileDown, Plus, Save, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTACHMENT_KEYS,
  ATTACHMENT_LABELS,
  SECTIONS,
  SELF_ITEMS,
  SELF_SCALE,
  WORK_SCALE,
  WORK_SKILLS,
  sentence,
  type Assessment,
  type FinalReportContent,
  type SectionKey,
} from "@/lib/validators/finalReport";

// Workstream H: the intern writes SLU's Technical Report. Editable while Draft or
// Returned; proof is attached in Google Classroom, not here (D2/D7).

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

// SLU's parts, and which written fields belong to each.
const PARTS: { title: string; keys: SectionKey[] }[] = [
  { title: "Company profile", keys: ["supervisors", "companyDescription", "officeCulture"] },
  {
    title: "Company resources",
    keys: [
      "hardwareCompany",
      "hardwareWork",
      "softwareOs",
      "softwareProductivity",
      "softwareDevTools",
      "softwareOthers",
    ],
  },
  {
    title: "Internship program",
    keys: [
      "tasks",
      "accomplishments",
      "challenges",
      "learningPersonality",
      "learningTechnical",
      "learningOtherProfessional",
      "learningProfessionalWork",
    ],
  },
];
const MISC: SectionKey[] = ["areasForImprovement", "programFeedback"];
const META = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

function Rating({
  id,
  label,
  scale,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  scale: string[];
  value: number | null;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-2 py-2">
      <legend className="float-left text-sm">{label}</legend>
      <div className="flex gap-1">
        {[4, 3, 2, 1].map((v) => (
          <label
            key={v}
            title={scale[v - 1]}
            className={`flex size-11 cursor-pointer items-center justify-center rounded-md border text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${value === v ? "border-primary bg-primary/10 font-semibold" : "border-input"}`}
          >
            <input
              type="radio"
              name={id}
              value={v}
              checked={value === v}
              disabled={disabled}
              onChange={() => onChange(v)}
              className="sr-only"
            />
            {v}
            <span className="sr-only"> {scale[v - 1]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FinalReportEditor({
  studentProfileId,
  status,
  content,
  office: initialOffice,
  hasPdf,
}: {
  studentProfileId: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED" | null;
  content: FinalReportContent;
  office: string;
  hasPdf: boolean;
}) {
  const router = useRouter();
  const editable = status === null || status === "DRAFT" || status === "RETURNED";
  const [sections, setSections] = useState<Record<string, string>>(
    Object.fromEntries(SECTIONS.map((s) => [s.key, content.sections[s.key] ?? ""]))
  );
  const [assessment, setAssessment] = useState<Assessment>(content.assessment);
  const [office, setOffice] = useState(initialOffice);
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
  const locked = !editable || pending !== null;
  // Up to 10,000 characters a section: a timeout or closed tab must not lose it.
  const dirty = useFormDraft(
    `final-report:${studentProfileId}`,
    { sections, assessment, office, scores, attachments },
    {
      sections: Object.fromEntries(SECTIONS.map((s) => [s.key, content.sections[s.key] ?? ""])),
      assessment: content.assessment,
      office: initialOffice,
      scores: {
        supervisorScore: content.supervisorScore?.toString() ?? "",
        supervisorScale: content.supervisorScale?.toString() ?? "5",
        peerScore: content.peerScore?.toString() ?? "",
        peerScale: content.peerScale?.toString() ?? "100",
      },
      attachments: Object.fromEntries(
        ATTACHMENT_KEYS.map((k) => [k, Boolean(content.attachments[k])])
      ),
    },
    (draft) => {
      setSections(draft.sections);
      setAssessment(draft.assessment);
      setOffice(draft.office);
      setScores(draft.scores);
      setAttachments(draft.attachments);
      toast.info("Restored your unsaved report text. Press Save draft to keep it.");
    },
    editable
  );

  async function call(url: string, method: string, body?: unknown) {
    const res = await sendJson(url, { method, body });
    if (!res.ok) toast.error(res.error);
    return res.ok;
  }

  const save = () =>
    call(`/api/students/${studentProfileId}/final-report`, "PUT", {
      sections,
      assessment: { ...assessment, others: assessment.others.filter((o) => o.label.trim()) },
      office,
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

  const field = (k: SectionKey) => (
    <div key={k} className="space-y-1">
      <Label htmlFor={`fr-${k}`}>{sentence(META[k].label)}</Label>
      {META[k].hint && <p className="text-xs text-muted-foreground">{META[k].hint}</p>}
      <Textarea
        id={`fr-${k}`}
        rows={k === "supervisors" ? 2 : 5}
        maxLength={10000}
        value={sections[k]}
        disabled={locked}
        onChange={(e) => setSections({ ...sections, [k]: e.target.value })}
      />
    </div>
  );
  const setList = (key: "work" | "self", i: number, v: number) =>
    setAssessment((a) => ({ ...a, [key]: a[key].map((old, j) => (j === i ? v : old)) }));

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        SLU&apos;s Technical Report, the final requirement for IT 421 / CS 331 / MMA 421. IDSMS
        prints it in SLU&apos;s format (legal paper, Cambria 12, 1.5 spacing, title page, table of
        contents). Mind the confidentiality arrangements with your company.
      </p>

      {PARTS.map((part, i) => (
        <section key={part.title} className="space-y-4">
          <h2 className="text-base font-semibold">{part.title}</h2>
          {i === 0 && (
            <div className="space-y-1">
              <Label htmlFor="fr-office">Department/Area/Office</Label>
              <Input
                id="fr-office"
                value={office}
                maxLength={150}
                disabled={locked}
                onChange={(e) => setOffice(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Company name and start and end dates come from your records.
              </p>
            </div>
          )}
          {part.keys.map(field)}
        </section>
      ))}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Assessment</h2>
        <fieldset className="rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">1. Work assessment</legend>
          <p className="text-xs text-muted-foreground">
            The opportunity you were provided to employ or enhance each skill. Extensive = 4,
            Adequate/Sufficient = 3, Occasional = 2, Rare to None = 1.
          </p>
          <div className="divide-y">
            {WORK_SKILLS.map((skill, i) => (
              <Rating
                key={skill}
                id={`work-${i}`}
                label={`${"abcdefghij"[i]}) ${skill}`}
                scale={WORK_SCALE}
                value={assessment.work[i]}
                disabled={locked}
                onChange={(v) => setList("work", i, v)}
              />
            ))}
            {assessment.others.map((o, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 py-2">
                <Input
                  aria-label={`Other skill ${i + 1}`}
                  placeholder="Others (please indicate)"
                  value={o.label}
                  maxLength={100}
                  disabled={locked}
                  className="max-w-xs"
                  onChange={(e) =>
                    setAssessment((a) => ({
                      ...a,
                      others: a.others.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x
                      ),
                    }))
                  }
                />
                <Rating
                  id={`other-${i}`}
                  label=""
                  scale={WORK_SCALE}
                  value={o.rating}
                  disabled={locked}
                  onChange={(v) =>
                    setAssessment((a) => ({
                      ...a,
                      others: a.others.map((x, j) => (j === i ? { ...x, rating: v } : x)),
                    }))
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove this skill"
                  disabled={locked}
                  onClick={() =>
                    setAssessment((a) => ({ ...a, others: a.others.filter((_, j) => j !== i) }))
                  }
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            {assessment.others.length < 5 && editable && (
              <div className="py-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={locked}
                  className="cursor-pointer gap-1.5"
                  onClick={() =>
                    setAssessment((a) => ({
                      ...a,
                      others: [...a.others, { label: "", rating: 3 }],
                    }))
                  }
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  k) Add another skill
                </Button>
              </div>
            )}
            <Rating
              id="supervisor-guidance"
              label="On the management and guidance provided by your supervisor"
              scale={WORK_SCALE}
              value={assessment.supervisorGuidance}
              disabled={locked}
              onChange={(v) => setAssessment((a) => ({ ...a, supervisorGuidance: v }))}
            />
            <Rating
              id="coworkers"
              label="On the coordination and communication of the people you work with"
              scale={WORK_SCALE}
              value={assessment.coworkers}
              disabled={locked}
              onChange={(v) => setAssessment((a) => ({ ...a, coworkers: v }))}
            />
          </div>
          {field("workRemarks")}
        </fieldset>

        <fieldset className="rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">2. Self-assessment</legend>
          <p className="text-xs text-muted-foreground">
            Your performance as an intern. Very Good = 4, Good = 3, Acceptable = 2, Poor = 1.
          </p>
          <div className="divide-y">
            {SELF_ITEMS.map((item, i) => (
              <Rating
                key={item}
                id={`self-${i}`}
                label={`${"abcdefghij"[i]}) ${item}`}
                scale={SELF_SCALE}
                value={assessment.self[i]}
                disabled={locked}
                onChange={(v) => setList("self", i, v)}
              />
            ))}
          </div>
          {field("selfRemarks")}
        </fieldset>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">3. Miscellany</h3>
          {MISC.map(field)}
        </div>
      </section>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Evaluation scores (for your adviser)</legend>
        <p className="text-xs text-muted-foreground">
          Copy the overall scores from the signed evaluation forms (the forms go to Google
          Classroom). Not printed in the report.
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
                disabled={locked}
                onChange={(e) => setScores({ ...scores, [key]: e.target.value })}
                className="w-28"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Appendix, in Google Classroom</legend>
        {ATTACHMENT_KEYS.map((k) => (
          <label key={k} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={attachments[k]}
              disabled={locked}
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
              {pending === "save"
                ? "Saving…"
                : dirty
                  ? "Save draft (unsaved changes)"
                  : "Save draft"}
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
