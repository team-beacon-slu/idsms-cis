import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";

// R1: plug-and-play AI connections, set by the Super Admin on Settings. Two slots:
// - general: jobs that read only public text (the help pages, company names);
// - private: jobs that read interns' words. Only a connection the department has
//   approved for that (on the lab server, one on SLU hardware; for the beta, Gemini,
//   which the DPO approved for testers) goes here. Empty = those jobs stay off; they
//   never fall back to the general slot.
// The key itself never enters the database: a connection names the environment
// variable that holds it (set on the server), so this page can't leak or store a secret.
export const AI_CONNECTIONS_KEY = "ai:connections";

// *_API_KEY only, so a connection can't send DATABASE_URL or NEXTAUTH_SECRET to its URL.
const KEY_ENV = /^[A-Z][A-Z0-9_]{0,50}_API_KEY$/;

export const connectionSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    provider: z.enum(["gemini", "openai"]),
    baseUrl: z
      .string()
      .trim()
      .url()
      .refine((u) => /^https?:\/\//.test(u), "Use an http or https URL")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    // Optional for an OpenAI-compatible server that needs no key (a local Ollama).
    keyEnv: z
      .string()
      .trim()
      .regex(KEY_ENV, "The key's variable name must end in _API_KEY, e.g. GEMINI_API_KEY")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    embeddingModel: z.string().trim().min(1).max(100),
    chatModel: z.string().trim().min(1).max(100),
  })
  .refine((c) => c.provider === "gemini" || !!c.baseUrl, {
    message: "An OpenAI-compatible connection needs its base URL",
    path: ["baseUrl"],
  })
  .refine((c) => c.provider === "openai" || !!c.keyEnv, {
    message: "Gemini needs the name of the variable holding its key",
    path: ["keyEnv"],
  });
export type AiConnection = z.infer<typeof connectionSchema>;

export const connectionsSchema = z.object({
  general: connectionSchema.nullable(),
  private: connectionSchema.nullable(),
});
export type AiConnections = z.infer<typeof connectionsSchema>;

// What a fresh install offers: Gemini on GEMINI_API_KEY for public text only.
export const GEMINI_DEFAULT: AiConnection = {
  name: "Gemini",
  provider: "gemini",
  keyEnv: "GEMINI_API_KEY",
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
  chatModel: process.env.GEMINI_SENTIMENT_MODEL || "gemini-3.8-flash",
};

export async function getConnections(): Promise<AiConnections> {
  const row = await prisma.systemConfig.findUnique({
    where: { configKey: AI_CONNECTIONS_KEY },
    select: { configValue: true },
  });
  const parsed = connectionsSchema.safeParse(row?.configValue);
  return parsed.success ? parsed.data : { general: GEMINI_DEFAULT, private: null };
}

export async function setConnections(input: unknown, actingUserId: string) {
  const value = connectionsSchema.parse(input);
  await prisma.systemConfig.upsert({
    where: { configKey: AI_CONNECTIONS_KEY },
    create: {
      configKey: AI_CONNECTIONS_KEY,
      configValue: value as unknown as Prisma.InputJsonValue,
      updatedBy: actingUserId,
    },
    update: { configValue: value as unknown as Prisma.InputJsonValue, updatedBy: actingUserId },
  });
  await logEvent({
    userId: actingUserId,
    action: "AI_CONNECTIONS_CHANGED",
    entityType: "SystemConfig",
    // Names and models only; there is no key here to log.
    detail: {
      general: value.general && `${value.general.name} (${value.general.chatModel})`,
      private: value.private && `${value.private.name} (${value.private.chatModel})`,
    },
  });
  return value;
}

export const keyIsSet = (conn: AiConnection) => !conn.keyEnv || !!process.env[conn.keyEnv];
