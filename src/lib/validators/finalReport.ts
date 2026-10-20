// Workstream H: the Final Technical Report (PRD Module 7). Section keys are
// the place to change when SLU's official outline arrives.
import { z } from "zod";

export const SECTION_KEYS = [
  "companyOverview",
  "introduction",
  "workAccomplished",
  "learnings",
  "recommendations",
] as const;

export const SECTION_LABELS: Record<(typeof SECTION_KEYS)[number], string> = {
  companyOverview: "company overview",
  introduction: "introduction",
  workAccomplished: "work accomplished",
  learnings: "learnings",
  recommendations: "recommendations",
};

// D2/D7: proof stays in Google Classroom; IDSMS records that it is attached.
export const ATTACHMENT_KEYS = [
  "attendanceProof",
  "certificateOfCompletion",
  "certificateOfAttendance",
  "certificatesOfParticipation",
] as const;

export const ATTACHMENT_LABELS: Record<(typeof ATTACHMENT_KEYS)[number], string> = {
  attendanceProof: "attendance proof",
  certificateOfCompletion: "certificate of completion",
  certificateOfAttendance: "certificate of attendance",
  certificatesOfParticipation: "certificates of participation",
};

const section = z.string().trim().max(10000, "Keep each section under 10,000 characters");
const scale = z.number().int().min(1).max(100);
const score = z.number().min(0).max(100);

export const finalReportDraftSchema = z
  .object({
    sections: z
      .object(Object.fromEntries(SECTION_KEYS.map((k) => [k, section.optional()])))
      .strict()
      .optional(),
    supervisorScore: score.nullable().optional(),
    supervisorScale: scale.nullable().optional(),
    peerScore: score.nullable().optional(),
    peerScale: scale.nullable().optional(),
    attachments: z
      .object(Object.fromEntries(ATTACHMENT_KEYS.map((k) => [k, z.boolean().optional()])))
      .strict()
      .optional(),
  })
  .refine(
    (d) =>
      d.supervisorScore == null ||
      d.supervisorScale == null ||
      d.supervisorScore <= d.supervisorScale,
    {
      message: "The supervisor score can't be above its scale",
      path: ["supervisorScore"],
    }
  )
  .refine((d) => d.peerScore == null || d.peerScale == null || d.peerScore <= d.peerScale, {
    message: "The peer score can't be above its scale",
    path: ["peerScore"],
  });

export type FinalReportDraft = z.infer<typeof finalReportDraftSchema>;

export interface FinalReportContent {
  sections: Partial<Record<string, string>>;
  supervisorScore: number | null;
  supervisorScale: number | null;
  peerScore: number | null;
  peerScale: number | null;
  attachments: Partial<Record<string, boolean>>;
}

// What still blocks submission, in reading order; empty means ready.
export function submitProblems(r: FinalReportContent): string[] {
  const problems: string[] = [];
  for (const k of SECTION_KEYS) {
    if (!r.sections[k]?.trim()) problems.push(`Write the ${SECTION_LABELS[k]} section`);
  }
  if (r.supervisorScore == null || r.supervisorScale == null) {
    problems.push("Enter the supervisor evaluation score");
  }
  if (r.peerScore == null || r.peerScale == null) problems.push("Enter the peer evaluation score");
  for (const k of ATTACHMENT_KEYS) {
    if (!r.attachments[k]) {
      problems.push(`Mark the ${ATTACHMENT_LABELS[k]} as attached in Google Classroom`);
    }
  }
  return problems;
}

// Stored report (JSON columns, Decimal scores) → plain content.
export type Attachments = Partial<Record<string, { attached: boolean; confirmed: boolean }>>;
export const asSections = (v: unknown) =>
  v && typeof v === "object" ? (v as Record<string, string>) : {};
export const asAttachments = (v: unknown) => (v && typeof v === "object" ? (v as Attachments) : {});
const num = (v: unknown) => (v == null ? null : Number(v));

export function toContent(report: {
  sections: unknown;
  supervisorScore: unknown;
  supervisorScale: number | null;
  peerScore: unknown;
  peerScale: number | null;
  attachments: unknown;
}): FinalReportContent {
  return {
    sections: asSections(report.sections),
    supervisorScore: num(report.supervisorScore),
    supervisorScale: report.supervisorScale,
    peerScore: num(report.peerScore),
    peerScale: report.peerScale,
    attachments: Object.fromEntries(
      Object.entries(asAttachments(report.attachments)).map(([k, v]) => [k, Boolean(v?.attached)])
    ),
  };
}
