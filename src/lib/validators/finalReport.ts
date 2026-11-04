// Workstream H: the Final Technical Report (PRD Module 7), now SLU's own outline
// ("Technical Report", final requirement for IT 421 / CS 331 / MMA 421). Client-safe:
// the editor, the service and the PDF share these definitions.
import { z } from "zod";

// Every written part of the report, in SLU's order. `list` parts print as A, B, C rows
// (one per paragraph); `optional` parts are left out of the PDF when empty, as SLU asks
// ("Do not include this section otherwise").
export const SECTIONS = [
  {
    key: "supervisors",
    label: "supervising personnel - designation",
    hint: "Each supervisor on their own line: name - designation.",
  },
  {
    key: "companyDescription",
    label: "company description",
    hint: "A general description of the organization, then the specific function of the department/area/office you worked for (1-2 pages). Do NOT copy and paste the profile from the company's website or social media account/s.",
  },
  {
    key: "officeCulture",
    label: "office environment/culture",
    hint: "The work environment and culture: the company/office policies and practices you had to comply with or adapt to, the general atmosphere and the people you worked with (1-2 pages).",
  },
  {
    key: "hardwareCompany",
    label: "hardware: company-wide",
    hint: "The hardware available in the company/department (servers, PCs, laptops): estimated number of units, computer specifications/types, network set-up. E.g. all 15 personnel use branded laptops (Dell, HP) with internet access of about 20 Mbps.",
  },
  {
    key: "hardwareWork",
    label: "hardware: at work",
    hint: "Were you assigned a specific machine, did you use your own laptop or what was available? Other hardware and peripherals you worked with (printers, scanners), with specifications/types.",
  },
  { key: "softwareOs", label: "operating systems", hint: "Only those YOU actually used." },
  { key: "softwareProductivity", label: "productivity tools", hint: "Only those YOU used." },
  {
    key: "softwareDevTools",
    label: "software development tools and technologies",
    hint: "IDEs, development platforms, testing tools, etc. that YOU used.",
  },
  {
    key: "softwareOthers",
    label: "other software",
    hint: "Customized applications or company-owned software used by the organization.",
  },
  {
    key: "tasks",
    label: "task list",
    hint: "The tasks assigned to you, each with a brief description. One task per paragraph (leave a blank line between).",
    list: true,
  },
  {
    key: "accomplishments",
    label: "main accomplishments",
    hint: "Your main output and the benefits the company gained from your work. One per paragraph.",
    list: true,
  },
  {
    key: "challenges",
    label: "challenges faced",
    hint: "The main challenges/problems you faced and how you overcame/solved them. One per paragraph.",
    list: true,
  },
  { key: "learningPersonality", label: "personality and/or social aspect", hint: "" },
  { key: "learningTechnical", label: "technical knowledge and/or skills", hint: "" },
  { key: "learningOtherProfessional", label: "other professional skills", hint: "" },
  {
    key: "learningProfessionalWork",
    label: "professional work",
    hint: "General insights: what you learned about the office environment, the business your company focuses on, people in the workplace, the IT industry, etc.",
  },
  {
    key: "workRemarks",
    label: "remarks on your host company",
    hint: "Other comments about your host company, if any. Left out of the report when empty.",
    optional: true,
  },
  {
    key: "selfRemarks",
    label: "remarks on your performance",
    hint: "Other comments about your performance not covered elsewhere, if any. Left out when empty.",
    optional: true,
  },
  {
    key: "areasForImprovement",
    label: "areas for improvement",
    hint: "Where you can still improve: personal, social, technical and/or professional.",
  },
  {
    key: "programFeedback",
    label: "program",
    hint: "Which courses in your program/curriculum were helpful in your internship? What other skills or knowledge do you wish the BSIT/BSCS program would enhance or include?",
  },
] as const satisfies readonly {
  key: string;
  label: string;
  hint: string;
  list?: boolean;
  optional?: boolean;
}[];

export type SectionKey = (typeof SECTIONS)[number]["key"];
export const SECTION_KEYS = SECTIONS.map((s) => s.key) as SectionKey[];
export const SECTION_LABELS = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label])) as Record<
  SectionKey,
  string
>;
const OPTIONAL = new Set<string>(
  SECTIONS.filter((s) => "optional" in s && s.optional).map((s) => s.key)
);

// Labels are lower-case for mid-sentence use; sentence() capitalises one.
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A "list" part: one row per paragraph.
export const rows = (text: string | undefined) =>
  (text ?? "")
    .split(/\n\s*\n/)
    .map((r) => r.trim())
    .filter(Boolean);

// ASSESSMENT 1. Work Assessment: the opportunity the internship gave to employ or
// enhance each skill. Rating Scale: Extensive = 4, Adequate/Sufficient = 3,
// Occasional = 2, Rare to None = 1.
export const WORK_SKILLS = [
  "Analytical skills",
  "Design skills",
  "Coding and/or testing",
  "Encoding skills",
  "Organizational skills",
  "Technical support",
  "Communication skills",
  "Interpersonal skills",
  "Leadership skills",
  "Quick thinking",
] as const;
export const WORK_SCALE = ["Rare to None", "Occasional", "Adequate/Sufficient", "Extensive"];

// ASSESSMENT 2. Self-Assessment. Rating Scale: Very Good = 4, Good = 3,
// Acceptable = 2, Poor = 1.
export const SELF_ITEMS = [
  "Compliance with general company guidelines",
  "Initiative and willingness to work",
  "Resourcefulness and creativity",
  "Ability to follow instructions",
  "Ability to complete tasks within a given amount of time",
  "Quality of work",
  "Interpersonal skills",
  "Communication skills",
  "Reliability and responsibility",
  "Critical thinking",
] as const;
export const SELF_SCALE = ["Poor", "Acceptable", "Good", "Very Good"];

const rating = z.number().int().min(1).max(4);
const maybeRating = rating.nullable();

export const assessmentSchema = z.object({
  work: z.array(maybeRating).length(WORK_SKILLS.length),
  // k) Others (please indicate): extra skills the intern names.
  others: z
    .array(z.object({ label: z.string().trim().min(1).max(100), rating }))
    .max(5)
    .default([]),
  supervisorGuidance: maybeRating, // "On the management and guidance provided by your supervisor"
  coworkers: maybeRating, // "On the coordination and communication of the people you work with"
  self: z.array(maybeRating).length(SELF_ITEMS.length),
});
export type Assessment = z.infer<typeof assessmentSchema>;

export const emptyAssessment = (): Assessment => ({
  work: WORK_SKILLS.map(() => null),
  others: [],
  supervisorGuidance: null,
  coworkers: null,
  self: SELF_ITEMS.map(() => null),
});

// APPENDIX. Proof stays in Google Classroom (D2/D7); IDSMS records that it is attached.
export const ATTACHMENT_KEYS = [
  "signedWeeklyReports",
  "attendanceProof",
  "photographs",
  "certificateOfCompletion",
  "certificateOfParticipation",
  "hteEvaluation",
] as const;

export const ATTACHMENT_LABELS: Record<(typeof ATTACHMENT_KEYS)[number], string> = {
  signedWeeklyReports:
    "signed weekly work reports, in chronological order, with their attachments (waiver, letters of absence, OT/UT authorizations)",
  attendanceProof: "proof of attendance (daily time record, logbook, etc.)",
  photographs: "photograph(s) of the trainee in the workplace",
  certificateOfCompletion: "certificate of completion issued by the organization",
  certificateOfParticipation: "certificate of participation issued by the SLU Data Privacy Office",
  hteEvaluation: "FM-VAA-052 Host Training Establishment (HTE) Evaluation Form",
};

const section = z.string().trim().max(10000, "Keep each part under 10,000 characters");
const scale = z.number().int().min(1).max(100);
const score = z.number().min(0).max(100);

export const finalReportDraftSchema = z
  .object({
    sections: z
      .object(Object.fromEntries(SECTION_KEYS.map((k) => [k, section.optional()])))
      .strict()
      .optional(),
    assessment: assessmentSchema.optional(),
    // Department/Area/Office, kept on the profile (shared with the JLE).
    office: z.string().trim().max(150).optional(),
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
  assessment: Assessment;
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
    if (!OPTIONAL.has(k) && !r.sections[k]?.trim()) {
      problems.push(`Write the ${SECTION_LABELS[k]} part`);
    }
  }
  const a = r.assessment;
  if ([...a.work, a.supervisorGuidance, a.coworkers].some((v) => v == null)) {
    problems.push("Rate every item of the work assessment");
  }
  if (a.self.some((v) => v == null)) problems.push("Rate every item of the self-assessment");
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
export const asAssessment = (v: unknown): Assessment => {
  const parsed = assessmentSchema.safeParse(v);
  return parsed.success ? parsed.data : emptyAssessment();
};
const num = (v: unknown) => (v == null ? null : Number(v));

export function toContent(report: {
  sections: unknown;
  assessment: unknown;
  supervisorScore: unknown;
  supervisorScale: number | null;
  peerScore: unknown;
  peerScale: number | null;
  attachments: unknown;
}): FinalReportContent {
  return {
    sections: asSections(report.sections),
    assessment: asAssessment(report.assessment),
    supervisorScore: num(report.supervisorScore),
    supervisorScale: report.supervisorScale,
    peerScore: num(report.peerScore),
    peerScale: report.peerScale,
    attachments: Object.fromEntries(
      Object.entries(asAttachments(report.attachments)).map(([k, v]) => [k, Boolean(v?.attached)])
    ),
  };
}
