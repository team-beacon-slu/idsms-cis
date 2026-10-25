import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { notify } from "@/lib/services/notifications/notify";
import { getAiSettings, type AiSettings } from "@/lib/ai/settings";
import {
  getConnections,
  keyIsSet,
  type AiConnection,
  type AiConnections,
} from "@/lib/ai/connections";

// The AI jobs (ai-assist-plan §6). `reads: "intern"` jobs use only the private connection.
// Every feature asks `connectionFor(job)` first: no connection back means the feature
// simply isn't shown (plug and play: nothing waits on a model that isn't there).
export const JOBS = {
  copy: { label: "Copy detection", reads: "intern", kind: "embed" },
  search: { label: "Semantic search", reads: "intern", kind: "embed" },
  coverage: { label: "Plan coverage", reads: "intern", kind: "embed" },
  tone: { label: "Tone hint", reads: "intern", kind: "chat" },
  summary: { label: "Weekly summary", reads: "intern", kind: "chat" },
  clarity: { label: "Clarity coach", reads: "intern", kind: "chat" },
  help: { label: "Help assistant", reads: "public", kind: "chat" },
  companies: { label: "Duplicate companies", reads: "public", kind: "chat" },
} as const;
export type JobId = keyof typeof JOBS;
export const JOB_IDS = Object.keys(JOBS) as JobId[];

const STATE_KEY = "ai:job_state";
export const EMBEDDED_WITH_KEY = "ai:embedded_with"; // the model every stored vector came from

// R2 thresholds (job grill Q8).
export const RATING_WINDOW = 50;
export const MIN_RATINGS = 20;
export const NOT_RIGHT_LIMIT = 0.3;
export const FAILURES_TO_PAUSE = 3;
const PAUSE_MS = 24 * 60 * 60 * 1000; // until the next nightly run

export interface JobState {
  offReason?: string; // switched off by ratings; needs a re-enable from the panel
  offAt?: string;
  since?: string; // ratings before this (the last re-enable) no longer count
  failures?: number; // calls failed in a row
  pausedUntil?: string; // broken connection: retried after this
}
type States = Partial<Record<JobId, JobState>>;

export async function getJobStates(): Promise<States> {
  const row = await prisma.systemConfig.findUnique({
    where: { configKey: STATE_KEY },
    select: { configValue: true },
  });
  return (row?.configValue as States | undefined) ?? {};
}

async function patchState(job: JobId, patch: JobState | null) {
  const states = await getJobStates();
  states[job] = patch === null ? {} : { ...states[job], ...patch };
  await prisma.systemConfig.upsert({
    where: { configKey: STATE_KEY },
    create: { configKey: STATE_KEY, configValue: states as Prisma.InputJsonValue },
    update: { configValue: states as Prisma.InputJsonValue },
  });
}

async function getEmbeddedWith(): Promise<string | null> {
  const row = await prisma.systemConfig.findUnique({
    where: { configKey: EMBEDDED_WITH_KEY },
    select: { configValue: true },
  });
  return typeof row?.configValue === "string" ? row.configValue : null;
}

export interface JobStatus {
  job: JobId;
  on: boolean;
  reason: string; // why it's off, or "On"
  connection: AiConnection | null;
}

// Pure, so the panel and the tests share one rule.
export function jobStatus(
  job: JobId,
  ctx: {
    settings: Pick<AiSettings, "enabled" | "lastEval">;
    connections: AiConnections;
    states: States;
    embeddedWith: string | null;
    now?: Date;
  }
): JobStatus {
  const def = JOBS[job];
  const connection = def.reads === "intern" ? ctx.connections.private : ctx.connections.general;
  const off = (reason: string): JobStatus => ({ job, on: false, reason, connection });
  if (!ctx.settings.enabled) return off("AI is switched off");
  if (!connection) {
    return off(
      def.reads === "intern"
        ? "No connection approved to read interns' words"
        : "No general connection"
    );
  }
  if (!keyIsSet(connection)) return off(`${connection.keyEnv} is not set on the server`);
  const state = ctx.states[job] ?? {};
  if (state.offReason) return off(state.offReason);
  if (state.pausedUntil && new Date(state.pausedUntil) > (ctx.now ?? new Date())) {
    return off("Paused: the connection kept failing; retried at the next nightly run");
  }
  if (def.kind === "embed" && ctx.embeddedWith && ctx.embeddedWith !== connection.embeddingModel) {
    return off(
      `Stored entries use ${ctx.embeddedWith}; re-embed them for ${connection.embeddingModel}`
    );
  }
  // Guardrail 3: copy detection runs only on a test passed on this very model.
  if (job === "copy") {
    const ev = ctx.settings.lastEval;
    if (!ev?.passes) return off("Its golden-set test hasn't passed yet");
    if (ev.model !== connection.embeddingModel) {
      return off(
        `Its test ran on ${ev.model ?? "another model"}; re-run it on ${connection.embeddingModel}`
      );
    }
  }
  return { job, on: true, reason: "On", connection };
}

export async function allJobStatuses(): Promise<JobStatus[]> {
  const [settings, connections, states, embeddedWith] = await Promise.all([
    getAiSettings(),
    getConnections(),
    getJobStates(),
    getEmbeddedWith(),
  ]);
  return JOB_IDS.map((job) => jobStatus(job, { settings, connections, states, embeddedWith }));
}

// The one question every feature asks. Null = don't show the feature.
export async function connectionFor(
  job: JobId,
  user?: { aiAssist?: boolean }
): Promise<AiConnection | null> {
  if (user && user.aiAssist === false) return null; // the person's own switch
  const status = (await allJobStatuses()).find((s) => s.job === job)!;
  return status.on ? status.connection : null;
}

async function tellAdmins(title: string, body: string) {
  const admins = await prisma.user.findMany({
    where: { role: Role.SUPER_ADMIN, isActive: true, deletedAt: null },
    select: { id: true },
  });
  await notify({
    userIds: admins.map((a) => a.id),
    trigger: "AI_JOB_OFF",
    title,
    body,
    link: "/settings#ai",
    email: true,
  });
}

// R2, broken connection: 3 failed calls in a row pause the job until the next night.
export async function runJob<T>(job: JobId, call: () => Promise<T>): Promise<T> {
  try {
    const result = await call();
    const state = (await getJobStates())[job];
    if (state?.failures) await patchState(job, { failures: 0 });
    return result;
  } catch (error) {
    const failures = ((await getJobStates())[job]?.failures ?? 0) + 1;
    if (failures >= FAILURES_TO_PAUSE) {
      await patchState(job, {
        failures: 0,
        pausedUntil: new Date(Date.now() + PAUSE_MS).toISOString(),
      });
      await tellAdmins(
        `AI paused: ${JOBS[job].label}`,
        `${FAILURES_TO_PAUSE} calls failed in a row (${(error as Error).message.slice(0, 160)}). It retries at the next nightly run.`
      );
    } else {
      await patchState(job, { failures });
    }
    throw error;
  }
}

// R2, nightly batch: more than 20% failed pauses the jobs it ran.
export async function pauseAfterBatch(jobs: JobId[], failed: number, total: number) {
  if (total < 5 || failed / total <= 0.2) return;
  const until = new Date(Date.now() + PAUSE_MS).toISOString();
  for (const job of jobs) await patchState(job, { pausedUntil: until, failures: 0 });
  await tellAdmins(
    "AI paused after the nightly run",
    `${failed} of ${total} reports failed. ${jobs.map((j) => JOBS[j].label).join(", ")} retry next night.`
  );
}

// Pure: should the ratings switch the job off?
export function ratingsVerdict(ratings: { correct: boolean }[]) {
  const window = ratings.slice(0, RATING_WINDOW);
  const notRight = window.filter((r) => !r.correct).length;
  return {
    count: window.length,
    notRight,
    switchOff: window.length >= MIN_RATINGS && notRight / window.length >= NOT_RIGHT_LIMIT,
  };
}

async function ratingsFor(job: JobId, since?: string) {
  return prisma.aiFeedback.findMany({
    where: { job, ...(since ? { createdAt: { gt: new Date(since) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: RATING_WINDOW,
    select: { correct: true },
  });
}

// R2, wrong answers: an adviser's Correct / Not right on any hint.
export async function rateHint(
  job: JobId,
  targetId: string,
  correct: boolean,
  actingUser: { id: string }
) {
  await prisma.aiFeedback.upsert({
    where: { job_targetId_userId: { job, targetId, userId: actingUser.id } },
    create: { job, targetId, userId: actingUser.id, correct },
    update: { correct, createdAt: new Date() },
  });
  const state = (await getJobStates())[job] ?? {};
  if (state.offReason) return;
  const verdict = ratingsVerdict(await ratingsFor(job, state.since));
  if (!verdict.switchOff) return;
  const reason = `Switched off: ${verdict.notRight} of the last ${verdict.count} ratings were Not right`;
  await patchState(job, { offReason: reason, offAt: new Date().toISOString() });
  await logEvent({
    userId: null,
    action: "AI_JOB_SWITCHED_OFF",
    entityType: "SystemConfig",
    detail: { job, notRight: verdict.notRight, count: verdict.count },
  });
  await tellAdmins(
    `AI switched off: ${JOBS[job].label}`,
    `${reason}. Re-test it from Settings › AI before turning it back on.`
  );
}

export async function ratingSummary(job: JobId, since?: string) {
  return ratingsVerdict(await ratingsFor(job, since));
}

// Back on after IT's re-test. Copy detection also needs its golden-set test passed on
// the current model (jobStatus checks that); older ratings stop counting.
export async function reenableJob(job: JobId, actingUserId: string) {
  await patchState(job, null);
  await patchState(job, { since: new Date().toISOString() });
  await logEvent({
    userId: actingUserId,
    action: "AI_JOB_REENABLED",
    entityType: "SystemConfig",
    detail: { job },
  });
}

// Guardrail 2: a new embedding model means every stored vector is re-made by the
// nightly job (it picks up reports whose aiProcessedAt is cleared).
export async function reembedAll(model: string, actingUserId: string) {
  await prisma.$executeRaw`UPDATE daily_report_entries SET embedding_vector = NULL WHERE embedding_vector IS NOT NULL`;
  await prisma.weeklyReport.updateMany({
    where: { aiProcessedAt: { not: null } },
    data: { aiProcessedAt: null },
  });
  await prisma.systemConfig.upsert({
    where: { configKey: EMBEDDED_WITH_KEY },
    create: { configKey: EMBEDDED_WITH_KEY, configValue: model, updatedBy: actingUserId },
    update: { configValue: model, updatedBy: actingUserId },
  });
  await logEvent({
    userId: actingUserId,
    action: "AI_REEMBED_STARTED",
    entityType: "SystemConfig",
    detail: { model },
  });
}

export async function markEmbeddedWith(model: string) {
  if ((await getEmbeddedWith()) === model) return;
  await prisma.systemConfig.upsert({
    where: { configKey: EMBEDDED_WITH_KEY },
    create: { configKey: EMBEDDED_WITH_KEY, configValue: model },
    update: { configValue: model },
  });
}

// The jobs a person sees: none when they turned AI assist off for themselves.
export async function jobsOnFor(user: { aiAssist?: boolean }): Promise<Set<JobId>> {
  if (user.aiAssist === false) return new Set();
  return new Set((await allJobStatuses()).filter((s) => s.on).map((s) => s.job));
}

// The transparency panel (R1, R2): per job, its connection and model, whether it's on and
// why not, and its ratings since it was last (re-)enabled.
export async function getAiPanel() {
  const [settings, connections, states, embeddedWith] = await Promise.all([
    getAiSettings(),
    getConnections(),
    getJobStates(),
    getEmbeddedWith(),
  ]);
  const rows = await Promise.all(
    JOB_IDS.map(async (job) => ({
      ...jobStatus(job, { settings, connections, states, embeddedWith }),
      label: JOBS[job].label,
      reads: JOBS[job].reads,
      offAt: states[job]?.offAt ?? null,
      switchedOff: !!states[job]?.offReason,
      ratings: await ratingSummary(job, states[job]?.since),
    }))
  );
  return { rows, connections, embeddedWith, lastEval: settings.lastEval };
}
