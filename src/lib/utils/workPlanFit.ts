// FR-WP-03: do the planned tasks fit the intern's program? A warning only (the
// coordinator decides), from plain keyword lists so it works without AI.
import type { Program } from "@prisma/client";

// Words that mark a task as computing work, shared by BSIT and BSCS.
const COMPUTING = [
  "develop",
  "program",
  "code",
  "coding",
  "software",
  "app",
  "web",
  "website",
  "system",
  "database",
  "sql",
  "api",
  "backend",
  "frontend",
  "front-end",
  "back-end",
  "server",
  "network",
  "security",
  "cyber",
  "cloud",
  "deploy",
  "debug",
  "bug",
  "test",
  "qa",
  "data",
  "script",
  "automat",
  "integrat",
  "it support",
  "technical support",
  "helpdesk",
  "help desk",
  "troubleshoot",
  "install",
  "configur",
  "hardware",
  "computer",
  "device",
  "linux",
  "windows",
  "devops",
  "git",
  "ui",
  "ux",
  "documentation",
  "requirement",
  "analysis",
  "design",
  "prototype",
  "machine learning",
  "ai",
  "model",
  "algorithm",
  "excel",
  "spreadsheet",
  "report generation",
  "maintain",
  "maintenance",
  "migration",
];

export const PROGRAM_KEYWORDS: Record<Program, string[]> = {
  BSIT: COMPUTING,
  BSCS: COMPUTING,
  BMMA: [
    "design",
    "graphic",
    "layout",
    "illustrat",
    "animat",
    "video",
    "edit",
    "photo",
    "camera",
    "shoot",
    "film",
    "audio",
    "sound",
    "music",
    "motion",
    "3d",
    "render",
    "model",
    "brand",
    "logo",
    "poster",
    "social media",
    "content",
    "campaign",
    "ui",
    "ux",
    "web",
    "website",
    "storyboard",
    "multimedia",
    "photoshop",
    "illustrator",
    "premiere",
    "after effects",
    "blender",
    "figma",
    "canva",
    "publication",
    "print",
    "copywrit",
    "art",
    "visual",
    "typograph",
    "marketing material",
  ],
};

export const PROGRAM_NAME: Record<Program, string> = {
  BSIT: "Information Technology",
  BSCS: "Computer Science",
  BMMA: "Multimedia Arts",
};

type Task = { area?: string | null; description: string; output?: string | null };

// Matches at a word start, so "app" counts in "apps" but not in "happy".
function mentions(text: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}`, "i").test(text);
}

// Indexes of the filled-in tasks that mention none of the program's words.
export function tasksOutsideProgram(program: Program, tasks: Task[]): number[] {
  const words = PROGRAM_KEYWORDS[program];
  return tasks.flatMap((t, i) => {
    const text = [t.area, t.description, t.output].filter(Boolean).join(" ");
    if (!text.trim()) return [];
    return words.some((w) => mentions(text, w)) ? [] : [i];
  });
}
