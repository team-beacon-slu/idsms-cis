# Self-Hosted VM Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce every artifact needed to run IDSMS-CIS on a single self-hosted VM (Docker Compose: Next.js + Postgres/pgvector + MinIO + Caddy), so it can be applied the moment the university confirms its institutional Azure/AWS subscription — without touching any live cloud infrastructure now.

**Architecture:** One VM, four long-lived containers on one bridge network, only Caddy publishes 80/443. Caddy terminates TLS (auto Let's Encrypt) and reverse-proxies to the Next.js `app` container. `app` talks to `postgres` (`pgvector/pgvector:pg16`, plain Postgres + extension — not Supabase's stack) and `minio` (S3-compatible object storage, replacing Supabase Storage) over the internal network. The only application-code change is `src/lib/storage.ts` switching from `@supabase/supabase-js` to `@aws-sdk/client-s3`; everything else (services, RBAC, routes, UI, Prisma schema, `ci.yml`) is untouched.

**Tech Stack:** Next.js 14.2.35 (`output: "standalone"`), Node 24, Docker Compose, `pgvector/pgvector:pg16`, `minio/minio` + `minio/mc`, `caddy:2-alpine`, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (v3), GitHub Actions + `ghcr.io` + `appleboy/ssh-action`.

**Spec:** `C:\Users\arago\.claude\plans\glistening-purring-axolotl.md` (the approved design doc; this plan implements the "Code changes" section of it). Vault rationale copy: `C:\Vault\JayParagon\Efforts\idsms-cis\notes\idsms-vm-migration-plan.md`.

## Global Constraints

- Node `>=24.0.0` (`package.json#engines`, CI, devcontainer all pin this).
- The migration is **artifacts only** — no `docker` commands against a real host, no cloud API calls, no DNS changes. Everything produced here is a file in the repo.
- `src/lib/storage.ts` MUST keep these exports with identical names and signatures: `CHECKLIST_BUCKET: string`, `MOA_BUCKET: string`, `class InvalidFileError extends Error`, `validateUpload(file: File): void`, `uploadFile(bucket: string, path: string, file: File): Promise<string>`, `getSignedUrl(bucket: string, path: string, expiresInSeconds?: number): Promise<string>`. Call sites (`src/lib/services/checklistService.ts`, `src/app/api/companies/[id]/moa/route.ts`, `src/app/api/checklist-items/[id]/file/route.ts`, `src/lib/utils/apiError.ts`) and `src/lib/services/checklistService.test.ts` (which mocks `@/lib/storage` wholesale) must need **zero** changes.
- `jest.config.ts` sets `./src/lib/storage.ts` to a 90/90/90/90 coverage threshold — the rewritten test file must keep coverage at or above that.
- Never commit real secrets. `.env.example` holds only placeholders; `.env.production` is created on the VM by hand and is never in the repo (add it to `.gitignore`).
- Existing CI (`ci.yml`) stays green throughout: `npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npm test -- --coverage`, `npm run build`.
- No footer-stripping: commits end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` + the `Claude-Session:` line; PRs end with the `🤖 Generated with [Claude Code]` line (per this session's attribution system-reminder).

---

## File Structure

| File                                                  | New/Mod | Responsibility                                                                                                                                          |
| ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next.config.mjs`                                     | Modify  | Add `output: "standalone"` so the Docker runtime stage is minimal.                                                                                      |
| `Dockerfile`                                          | Create  | Multi-stage build (`deps` → `builder` runs `prisma generate` + `next build` → `runner` runs `node server.js` as non-root).                              |
| `.dockerignore`                                       | Create  | Keep build context small — exclude `node_modules`, `.next`, `.git`, `cypress`, tests, `coverage`, `docs`.                                               |
| `src/lib/storage.ts`                                  | Rewrite | Same exports, S3/MinIO client underneath; `getSignedUrl` returns an HMAC-signed same-origin proxy URL. Adds `signDownload`/`verifyDownloadSig` helpers. |
| `src/lib/storage.test.ts`                             | Rewrite | Mock `@aws-sdk/client-s3` instead of `@supabase/supabase-js`; keep ≥90% coverage.                                                                       |
| `src/app/api/storage/download/route.ts` (+`.test.ts`) | Create  | Verifies the HMAC + expiry, streams the object from MinIO (internal client). The only browser-facing path to stored files.                              |
| `package.json`                                        | Modify  | Remove `@supabase/supabase-js`; add `@aws-sdk/client-s3`.                                                                                               |
| `docker-compose.yml`                                  | Create  | The 4-service topology + `minio-init` one-shot bucket creator.                                                                                          |
| `Caddyfile`                                           | Create  | TLS + reverse-proxy `app:3000`; MinIO exposure per the Task 2 decision.                                                                                 |
| `.env.example`                                        | Modify  | Replace `SUPABASE_*` with `MINIO_*`; collapse `DATABASE_URL`/`DIRECT_URL` to the container DSN; add a "VM / production" section.                        |
| `.gitignore`                                          | Modify  | Add `.env.production`.                                                                                                                                  |
| `.github/workflows/ci.yml`                            | Modify  | Swap the two `SUPABASE_*` placeholder env vars for `MINIO_*`; add a `workflow_call:` trigger so `deploy.yml` can reuse it.                              |
| `src/app/api/health/route.ts`                         | Create  | `GET` → `SELECT 1` → `{status:"ok"}` / 503. Consumed by the compose healthcheck, the deploy gate, and an external uptime monitor.                       |
| `.github/workflows/deploy.yml`                        | Create  | On push to `main`: reuse `ci.yml`, build+push image to `ghcr.io` (sha + `stable` tags), SSH `docker compose pull && up -d --wait`.                      |
| `OPERATIONS.md`                                       | Create  | The post-graduation runbook (deploy/rollback, backups/restore, secret rotation, owners, IT contacts).                                                   |
| `docs/migration/from-supabase.md`                     | Create  | The one-time cutover runbook: `pg_dump`/`pg_restore`, `mc mirror`, verification SQL, rollback points.                                                   |
| `prisma/migrations_manual/003_storage_buckets.sql`    | Modify  | Prepend a "SUPERSEDED — see `docker-compose.yml` `minio-init`" header; leave the body as historical record.                                             |

---

### Task 1: Standalone build — `next.config.mjs`, `Dockerfile`, `.dockerignore`

**Files:**

- Modify: `next.config.mjs`
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**

- Consumes: nothing.
- Produces: a `Dockerfile` that produces an image whose `CMD` is `node server.js` listening on `PORT=3000`; relied on by `docker-compose.yml` (Task 3) and `deploy.yml` (Task 5).

- [ ] **Step 1: Add `output: "standalone"` to `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundles a minimal server + node_modules into .next/standalone so the
  // Docker runtime stage doesn't need the full dependency tree.
  output: "standalone",
  experimental: {
    outputFileTracingRoot: __dirname,
  },
};
```

- [ ] **Step 2: Verify the build still succeeds and emits the standalone server**

Run: `cd /c/CRACK/IDSMS-V2 && npm run build`
Expected: build passes; `.next/standalone/server.js` now exists (`ls .next/standalone/server.js`).

- [ ] **Step 3: Create `.dockerignore`**

```
node_modules
.next
.git
.github
cypress
coverage
docs
*.test.ts
*.test.tsx
.env*
npm-debug.log*
Dockerfile
docker-compose.yml
```

- [ ] **Step 4: Create `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# ---- deps: install with a clean, reproducible tree ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: prisma generate must run before next build ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ---- runner: minimal standalone server, non-root ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

Notes for the implementer:

- `prisma generate` in the builder is required — `@/lib/prisma` imports `@prisma/client`, and `next build` type-checks against the generated client.
- Do NOT run `prisma migrate`/`db push` in the image — schema changes are a deploy-time action against the live DB, documented in `docs/migration/from-supabase.md` (Task 6), not baked into the image.
- `prisma/` is copied into the runner because `@prisma/client`'s query engine resolves the schema path at runtime.

- [ ] **Step 5: Sanity-check the Dockerfile parses (no Docker daemon needed)**

Run: `cd /c/CRACK/IDSMS-V2 && docker build --help >/dev/null 2>&1 && echo "docker present, try: docker build -t idsms:local ." || echo "no docker here — implementer/CI validates the build; ensure syntax is correct by inspection"`
Expected: either a real `docker build` succeeds, or (no Docker on this machine) the file is inspected against the Next.js standalone Docker reference and left for CI/the VM to build.

- [ ] **Step 6: Commit**

```bash
git add next.config.mjs Dockerfile .dockerignore
git commit -m "$(printf 'build: standalone output + multi-stage Dockerfile\n\nAdds output: "standalone" to next.config.mjs and a deps/builder/runner\nDockerfile so the app can run as a container on a self-hosted VM.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Uj4BNAToAjvd4TJsQPoBVd')"
```

---

### Task 2: Rewrite `src/lib/storage.ts` — Supabase Storage → MinIO (S3) — TDD

**Files:**

- Modify: `package.json` (deps)
- Rewrite: `src/lib/storage.ts`
- Rewrite: `src/lib/storage.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: the exports named in Global Constraints, unchanged in shape. `docker-compose.yml` (Task 3) and `.env.example` (Task 3) must define the env vars this task reads.

**Env vars this task introduces** (Task 3 wires them into `.env.example`, `ci.yml`, `docker-compose.yml`):

- `MINIO_ENDPOINT` — internal Docker URL for uploads, e.g. `http://minio:9000`
- `MINIO_PUBLIC_ENDPOINT` — browser-reachable base for signed download URLs (value depends on Step 0 decision)
- `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` — app-scoped credentials
- `MINIO_REGION` — arbitrary string the SDK requires; use `us-east-1`

- [ ] **Step 0 — DECISION REQUIRED (you, the architect): how does `getSignedUrl` hand a browser a working download URL?**

`uploadFile` is mechanical — it always talks to `MINIO_ENDPOINT` (`http://minio:9000`) from inside the Docker network, no choice to make. `getSignedUrl` is the real decision, because MinIO is not published on the host and its SigV4 signature covers the request host + path, so a signed URL built against `http://minio:9000` is unreachable and a path-rewriting proxy breaks the signature.

Two viable approaches — pick one and implement that branch of Step 3/4:

- **Option A — MinIO on its own subdomain.** Ask IT for a second DNS record (`storage.<domain>`), add a Caddy site block `reverse_proxy minio:9000` with **no path rewrite**, set `MINIO_PUBLIC_ENDPOINT=https://storage.<domain>`. `getSignedUrl` uses a second `S3Client` whose `endpoint` is `MINIO_PUBLIC_ENDPOINT`, `forcePathStyle: true` → signs `https://storage.<domain>/<bucket>/<key>?X-Amz-...`, which Caddy passes straight through to MinIO. Closest to today's Supabase behaviour (a real signed URL straight to object storage). Cost: MinIO's S3 API is publicly reachable (behind TLS; still requires a valid signature), and one extra subdomain.
- **Option B — app-proxied download.** `getSignedUrl` returns a URL to _our own_ route (`/api/storage/download?b=<bucket>&k=<key>&exp=<ts>&sig=<hmac>`) where `<sig>` is an HMAC over `b|k|exp` keyed on `NEXTAUTH_SECRET`. A new `src/app/api/storage/download/route.ts` verifies the HMAC + expiry, then streams the object from `MINIO_ENDPOINT` (internal client) back to the browser. MinIO never faces the internet; no extra DNS. Cost: ~40 extra lines (the route + a tiny HMAC helper), and the app process streams file bytes.

```
# DECISION (2026-09-10, architect):
# Chosen option: B — app-proxied download.
# Why: MinIO never faces the internet (smaller attack surface), needs nothing
#      from university IT (no extra DNS), and the download is gated by the
#      app's own request handling instead of only a time-limited URL. The
#      byte-streaming cost is negligible at capstone scale with a 5MB cap.
```

**Option B concrete shape:**

- `getSignedUrl(bucket, path, expiresInSeconds=300)` returns a same-origin relative URL:
  `/api/storage/download?b=<bucket>&k=<encodeURIComponent(path)>&exp=<epochSeconds>&sig=<sig>`
  where `sig = base64url(HMAC-SHA256(NEXTAUTH_SECRET, \`${bucket}:${path}:${exp}\`))`.
- New file `src/app/api/storage/download/route.ts`: parse params, reject if `exp <= now`,
  recompute the HMAC and `crypto.timingSafeEqual`; on match, `s3Internal.send(new GetObjectCommand(...))`
  and stream `response.Body` back with the S3 `ContentType` and `Content-Disposition: inline`.
  Any failure → 403 (bad/expired sig) or 404 (missing object).
- No `@aws-sdk/s3-request-presigner`, no `s3Public`, no `MINIO_PUBLIC_ENDPOINT` — the proxied URL is same-origin.

- [ ] **Step 1: Swap the dependencies**

```bash
cd /c/CRACK/IDSMS-V2
npm uninstall @supabase/supabase-js
npm install @aws-sdk/client-s3
```

Expected: `package.json` no longer lists `@supabase/supabase-js`; lists `@aws-sdk/client-s3`; `package-lock.json` updated.

- [ ] **Step 2: Rewrite `src/lib/storage.test.ts` to mock the AWS SDK**

Replace the `jest.mock("@supabase/supabase-js", ...)` block and the derived-mock plumbing with mocks of the two AWS packages. The rest of the assertions stay conceptually the same (validate-before-upload, upsert semantics = plain overwrite, error wrapping, custom expiry, signed-URL return).

```ts
// S3Client / commands are constructed at import time in storage.ts's singleton,
// so the SDK must be mockable without real credentials. Mock fns live inside the
// factory (jest hoists jest.mock above imports).
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn((input) => ({ __type: "Put", input })),
  GetObjectCommand: jest.fn((input) => ({ __type: "Get", input })),
}));

process.env.NEXTAUTH_SECRET = "test-secret-for-hmac";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  CHECKLIST_BUCKET,
  InvalidFileError,
  getSignedUrl,
  uploadFile,
  validateUpload,
  verifyDownloadSig,
} from "@/lib/storage";

function makeFile(sizeBytes: number, type: string) {
  return new File([new Uint8Array(sizeBytes)], "file", { type });
}

beforeEach(() => {
  mockSend.mockReset();
  (PutObjectCommand as unknown as jest.Mock).mockClear();
});

describe("validateUpload", () => {
  it("accepts a PDF under the 5MB cap", () => {
    expect(() => validateUpload(makeFile(1024, "application/pdf"))).not.toThrow();
  });
  it("accepts a JPEG under the 2MB cap", () => {
    expect(() => validateUpload(makeFile(1024, "image/jpeg"))).not.toThrow();
  });
  it("accepts a PNG under the 2MB cap", () => {
    expect(() => validateUpload(makeFile(1024, "image/png"))).not.toThrow();
  });
  it("rejects an unsupported mime type", () => {
    expect(() => validateUpload(makeFile(1024, "application/zip"))).toThrow(InvalidFileError);
  });
  it("names 'unknown' when the file has no mime type", () => {
    expect(() => validateUpload(makeFile(1024, ""))).toThrow(/unknown/);
  });
  it("rejects a PDF over the 5MB cap", () => {
    expect(() => validateUpload(makeFile(5 * 1024 * 1024 + 1, "application/pdf"))).toThrow(
      InvalidFileError
    );
  });
  it("rejects an image over the 2MB cap using the image limit", () => {
    expect(() => validateUpload(makeFile(2 * 1024 * 1024 + 1, "image/png"))).toThrow(/2MB limit/);
  });
});

describe("uploadFile", () => {
  it("validates before ever calling S3", async () => {
    await expect(
      uploadFile(CHECKLIST_BUCKET, "path.zip", makeFile(10, "application/zip"))
    ).rejects.toThrow(InvalidFileError);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("puts the object with its content type and returns the path", async () => {
    mockSend.mockResolvedValue({});
    const result = await uploadFile(
      CHECKLIST_BUCKET,
      "profile-1/x.pdf",
      makeFile(10, "application/pdf")
    );
    expect(result).toBe("profile-1/x.pdf");
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: CHECKLIST_BUCKET,
        Key: "profile-1/x.pdf",
        ContentType: "application/pdf",
      })
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("wraps an S3 error as InvalidFileError", async () => {
    mockSend.mockRejectedValue(new Error("bucket not found"));
    await expect(
      uploadFile(CHECKLIST_BUCKET, "profile-1/x.pdf", makeFile(10, "application/pdf"))
    ).rejects.toThrow(/bucket not found/);
  });
});

describe("getSignedUrl (Option B — same-origin proxy URL)", () => {
  it("returns a /api/storage/download URL carrying bucket, key, exp and a sig", async () => {
    const url = await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf");
    const parsed = new URL(url, "http://x");
    expect(parsed.pathname).toBe("/api/storage/download");
    expect(parsed.searchParams.get("b")).toBe(CHECKLIST_BUCKET);
    expect(parsed.searchParams.get("k")).toBe("profile-1/x.pdf");
    expect(Number(parsed.searchParams.get("exp"))).toBeGreaterThan(Date.now() / 1000);
    expect(parsed.searchParams.get("sig")).toBeTruthy();
  });
  it("honours a custom expiry window", async () => {
    const before = Math.floor(Date.now() / 1000);
    const url = await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf", 60);
    const exp = Number(new URL(url, "http://x").searchParams.get("exp"));
    expect(exp).toBeGreaterThanOrEqual(before + 59);
    expect(exp).toBeLessThanOrEqual(before + 61);
  });
  it("produces a sig that verifyDownloadSig accepts, and rejects a tampered one", async () => {
    const url = await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf");
    const q = new URL(url, "http://x").searchParams;
    const exp = Number(q.get("exp"));
    expect(verifyDownloadSig(CHECKLIST_BUCKET, "profile-1/x.pdf", exp, q.get("sig")!)).toBe(true);
    expect(verifyDownloadSig(CHECKLIST_BUCKET, "profile-1/x.pdf", exp, "tampered")).toBe(false);
    expect(verifyDownloadSig(MOA_BUCKET, "profile-1/x.pdf", exp, q.get("sig")!)).toBe(false);
  });
  it("verifyDownloadSig rejects an expired exp", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const sig = // recompute via getSignedUrl path is future-dated, so sign inline is fine here:
      require("node:crypto")
        .createHmac("sha256", process.env.NEXTAUTH_SECRET!)
        .update(`${CHECKLIST_BUCKET}:k:${past}`)
        .digest("base64url");
    expect(verifyDownloadSig(CHECKLIST_BUCKET, "k", past, sig)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests — they must fail (storage.ts still imports Supabase)**

Run: `cd /c/CRACK/IDSMS-V2 && npx jest src/lib/storage.test.ts`
Expected: FAIL — cannot find `@supabase/supabase-js` mock / `storage.ts` import errors.

- [ ] **Step 4: Rewrite `src/lib/storage.ts` (Option B)**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// globalThis-cached singleton, mirroring src/lib/prisma.ts — Next dev
// hot-reload would otherwise open a fresh client per save.
const g = globalThis as unknown as { s3?: S3Client };

export const s3 =
  g.s3 ??
  new S3Client({
    endpoint: process.env.MINIO_ENDPOINT!,
    region: process.env.MINIO_REGION ?? "us-east-1",
    forcePathStyle: true, // MinIO has no wildcard-subdomain DNS
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
  });

if (process.env.NODE_ENV !== "production") g.s3 = s3;

export const CHECKLIST_BUCKET = "checklist-documents";
export const MOA_BUCKET = "moa-documents";

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export class InvalidFileError extends Error {
  constructor(message = "Invalid file") {
    super(message);
    this.name = "InvalidFileError";
  }
}

export function validateUpload(file: File): void {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new InvalidFileError(`Unsupported file type: ${file.type || "unknown"}`);
  }
  const maxBytes = file.type === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    throw new InvalidFileError(`File exceeds the ${maxBytes / (1024 * 1024)}MB limit`);
  }
}

// S3 PutObject overwrites by default — same effect as Supabase's upsert:true.
export async function uploadFile(bucket: string, path: string, file: File): Promise<string> {
  validateUpload(file);
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      })
    );
  } catch (err) {
    throw new InvalidFileError(err instanceof Error ? err.message : "Upload failed");
  }
  return path;
}

// Shared with src/app/api/storage/download/route.ts (Step 4b) to verify.
export function signDownload(bucket: string, path: string, exp: number): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET!)
    .update(`${bucket}:${path}:${exp}`)
    .digest("base64url");
}

export function verifyDownloadSig(bucket: string, path: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return false;
  const expected = Buffer.from(signDownload(bucket, path, exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

// Not a real S3 presigned URL — a same-origin link to our own proxy route
// (Option B). MinIO is never exposed to the browser.
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 300
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sig = signDownload(bucket, path, exp);
  const qs = new URLSearchParams({ b: bucket, k: path, exp: String(exp), sig });
  return `/api/storage/download?${qs.toString()}`;
}
```

- [ ] **Step 4b: Create `src/app/api/storage/download/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3, verifyDownloadSig, CHECKLIST_BUCKET, MOA_BUCKET } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS = new Set([CHECKLIST_BUCKET, MOA_BUCKET]);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const bucket = p.get("b") ?? "";
  const key = p.get("k") ?? "";
  const exp = Number(p.get("exp"));
  const sig = p.get("sig") ?? "";

  if (!ALLOWED_BUCKETS.has(bucket) || !key || !verifyDownloadSig(bucket, key, exp, sig)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!obj.Body) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(obj.Body.transformToWebStream(), {
      headers: {
        "Content-Type": obj.ContentType ?? "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
```

Add a matching `src/app/api/storage/download/route.test.ts`: 403 on tampered sig, 403 on expired `exp`, 403 on a bucket not in the allow-list, 200 + streamed body on a valid request (mock `@aws-sdk/client-s3` `send` to resolve `{ Body: { transformToWebStream: () => new ReadableStream() }, ContentType: "application/pdf" }`).

- [ ] **Step 5: Run the storage tests — must pass**

Run: `cd /c/CRACK/IDSMS-V2 && npx jest src/lib/storage.test.ts --coverage --collectCoverageFrom='src/lib/storage.ts'`
Expected: PASS; coverage for `src/lib/storage.ts` ≥ 90/90/90/90.

- [ ] **Step 6: Run the full suite + typecheck — nothing else regressed**

Run: `cd /c/CRACK/IDSMS-V2 && npx tsc --noEmit && npx jest`
Expected: `tsc` clean; all suites pass (`checklistService.test.ts` unaffected — it mocks `@/lib/storage` wholesale).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/storage.ts src/lib/storage.test.ts
# plus src/app/api/storage/download/route.ts if Option B
git commit -m "$(printf 'feat(storage): swap Supabase Storage for MinIO/S3\n\nsrc/lib/storage.ts now uses @aws-sdk/client-s3 against a self-hosted\nMinIO endpoint; exported signatures unchanged so no call site moves.\nDrops @supabase/supabase-js (unused elsewhere).\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Uj4BNAToAjvd4TJsQPoBVd')"
```

---

### Task 3: Runtime topology — `docker-compose.yml`, `Caddyfile`, `.env.example`, `.gitignore`, `ci.yml` env vars

**Files:**

- Create: `docker-compose.yml`
- Create: `Caddyfile`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml` (env block only — the `workflow_call` trigger is Task 5)

**Interfaces:**

- Consumes: the `Dockerfile` from Task 1 (the `app` service image), the `MINIO_*` env var names from Task 2.
- Produces: `docker compose config` validates; `app` service healthcheck hits `/api/health` (Task 4).

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
name: idsms

networks:
  idsms_net:

volumes:
  pg_data:
  minio_data:
  caddy_data:
  caddy_config:

services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: idsms
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: idsms
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks: [idsms_net]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U idsms -d idsms"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    networks: [idsms_net]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    networks: [idsms_net]
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $$MINIO_ROOT_USER $$MINIO_ROOT_PASSWORD &&
      mc mb -p local/checklist-documents &&
      mc mb -p local/moa-documents &&
      mc anonymous set none local/checklist-documents &&
      mc anonymous set none local/moa-documents
      "

  app:
    image: ghcr.io/team-beacon-slu/idsms-cis:${IMAGE_TAG:-stable}
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy
    env_file: .env.production
    networks: [idsms_net]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 25s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      app:
        condition: service_healthy
    networks: [idsms_net]
```

Implementer notes:

- `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `IMAGE_TAG` come from the shell / `.env` next to the compose file on the VM; `app` reads its own vars from `.env.production` (kept off the compose file so app secrets aren't in two places).
- If Task 2 chose Option A, add the `storage.<domain>` block to the Caddyfile (Step 2) — MinIO still does not get a `ports:` entry (Caddy reaches it over `idsms_net`).

- [ ] **Step 2: Create `Caddyfile`**

```
# Replace idsms.example.edu with the real subdomain before first deploy.
idsms.example.edu {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
	}
	reverse_proxy app:3000
	log {
		output file /data/access.log
		format json
	}
}

# --- Option A only: MinIO S3 API on its own hostname (no path rewrite) ---
# storage.idsms.example.edu {
# 	reverse_proxy minio:9000
# }
```

- [ ] **Step 3: Rewrite `.env.example`**

```
# Copy to .env.local for local dev, or to .env.production on the VM.
# Never commit a filled-in copy.

# --- Postgres ---
# Local dev against Supabase (until the VM cutover) keeps the pooled/direct split:
#   DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true"
#   DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"
# On the VM there is one Postgres container and no pooler — both point at it:
DATABASE_URL="postgresql://idsms:PASSWORD@postgres:5432/idsms"
DIRECT_URL="postgresql://idsms:PASSWORD@postgres:5432/idsms"

# --- NextAuth (database session strategy, FR-UM-11). openssl rand -base64 32 ---
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"   # on the VM: https://idsms.example.edu

# --- HMAC pepper for default student passwords (FR-UM-03). Distinct from NEXTAUTH_SECRET. ---
STUDENT_DEFAULT_PASSWORD_PEPPER=""

# --- Object storage (self-hosted MinIO; replaces Supabase Storage) ---
# Internal endpoint only — downloads are proxied through /api/storage/download
# (same-origin), so MinIO is never exposed to the browser.
MINIO_ENDPOINT="http://minio:9000"
MINIO_ACCESS_KEY=""
MINIO_SECRET_KEY=""
MINIO_REGION="us-east-1"                           # arbitrary; MinIO ignores it, the SDK requires it

# --- Third-party APIs (unchanged by hosting) ---
GEMINI_API_KEY=""
RESEND_API_KEY=""

# --- Compose-only vars (set next to docker-compose.yml on the VM, NOT in .env.production) ---
# POSTGRES_PASSWORD=      # must match the password in DATABASE_URL/DIRECT_URL above
# MINIO_ROOT_USER=
# MINIO_ROOT_PASSWORD=
# IMAGE_TAG=stable
```

- [ ] **Step 4: Add `.env.production` to `.gitignore`**

Append under the existing local-env section:

```
.env.production
```

- [ ] **Step 5: Swap the `SUPABASE_*` placeholders in `ci.yml` for `MINIO_*`**

In `.github/workflows/ci.yml`'s job-level `env:` block, replace:

```yaml
SUPABASE_URL: "https://ci-placeholder.supabase.co"
SUPABASE_SERVICE_ROLE_KEY: "ci-build-placeholder"
```

with:

```yaml
MINIO_ENDPOINT: "http://ci-placeholder:9000"
MINIO_ACCESS_KEY: "ci-build-placeholder"
MINIO_SECRET_KEY: "ci-build-placeholder"
MINIO_REGION: "us-east-1"
```

(These only need to be _defined_ — `next build` imports `storage.ts` transitively and `new S3Client()` reads them at module load; it does not connect. `NEXTAUTH_SECRET` is already in the CI env block and is what `getSignedUrl`/`verifyDownloadSig` use for the HMAC.)

- [ ] **Step 6: Validate the compose file**

Run: `cd /c/CRACK/IDSMS-V2 && docker compose config >/dev/null 2>&1 && echo OK || echo "no docker here — validate YAML by inspection + a yaml linter; CI/VM will run compose config"`
Expected: `OK`, or a clean YAML parse if Docker isn't installed locally.

- [ ] **Step 7: Re-run CI-equivalent checks locally**

Run: `cd /c/CRACK/IDSMS-V2 && npm run lint && npx tsc --noEmit && npm run build`
Expected: all green (build now runs with the `MINIO_*` env values present, no `SUPABASE_*`).

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml Caddyfile .env.example .gitignore .github/workflows/ci.yml
git commit -m "$(printf 'feat: docker compose topology + MinIO env wiring\n\nFour-service compose stack (postgres/minio/app/caddy) + one-shot bucket\ninit; .env.example and CI placeholders move from SUPABASE_* to MINIO_*.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Uj4BNAToAjvd4TJsQPoBVd')"
```

---

### Task 4: Health endpoint — `src/app/api/health/route.ts` — TDD

**Files:**

- Create: `src/app/api/health/route.ts`
- Create: `src/app/api/health/route.test.ts`

**Interfaces:**

- Consumes: `prisma` from `@/lib/prisma`.
- Produces: `GET /api/health` → `200 {"status":"ok"}` when the DB answers, `503 {"status":"error"}` otherwise. Consumed by `docker-compose.yml` `app` healthcheck (Task 3) and `deploy.yml` `--wait` gate (Task 5).

- [ ] **Step 1: Write the failing test**

```ts
import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: jest.fn() },
}));
import { prisma } from "@/lib/prisma";
const mockQuery = prisma.$queryRaw as jest.Mock;

beforeEach(() => mockQuery.mockReset());

it("returns 200 ok when the database responds", async () => {
  mockQuery.mockResolvedValue([{ "?column?": 1 }]);
  const res = await GET();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ status: "ok" });
});

it("returns 503 error when the database query throws", async () => {
  mockQuery.mockRejectedValue(new Error("connection refused"));
  const res = await GET();
  expect(res.status).toBe(503);
  await expect(res.json()).resolves.toEqual({ status: "error" });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `cd /c/CRACK/IDSMS-V2 && npx jest src/app/api/health/route.test.ts`
Expected: FAIL — `./route` has no `GET` export.

- [ ] **Step 3: Implement the route**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Deliberately unauthenticated and side-effect-free: the compose healthcheck,
// the deploy gate, and an external uptime monitor all hit this. It proves the
// process is up AND can reach Postgres — nothing more.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `cd /c/CRACK/IDSMS-V2 && npx jest src/app/api/health/route.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Full typecheck + build**

Run: `cd /c/CRACK/IDSMS-V2 && npx tsc --noEmit && npm run build`
Expected: green; `/api/health` shows in the route list as `ƒ` (dynamic).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/health/route.ts src/app/api/health/route.test.ts
git commit -m "$(printf 'feat: add /api/health liveness+DB check\n\nGET /api/health -> 200 {status:ok} when Postgres answers, else 503.\nUsed by the compose healthcheck, the deploy gate, and uptime monitoring.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Uj4BNAToAjvd4TJsQPoBVd')"
```

---

### Task 5: Deploy pipeline — `deploy.yml` + `ci.yml` `workflow_call`

**Files:**

- Modify: `.github/workflows/ci.yml` (add `workflow_call:` to `on:`)
- Create: `.github/workflows/deploy.yml`

**Interfaces:**

- Consumes: the `Dockerfile` (Task 1), `/api/health` (Task 4), `docker-compose.yml` staged on the VM (Task 3 file, deployed by hand per Task 6 runbook).
- Produces: on push to `main`, an image at `ghcr.io/team-beacon-slu/idsms-cis:<sha>` and `:stable`, then a live `docker compose up -d --wait` on the VM.

- [ ] **Step 1: Add `workflow_call` to `ci.yml`'s triggers**

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  workflow_call:
```

- [ ] **Step 2: Create `deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      image_tag:
        description: "Existing ghcr.io sha tag to roll back/forward to"
        required: false

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  validate:
    uses: ./.github/workflows/ci.yml

  build-and-push:
    needs: validate
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      tag: ${{ steps.tag.outputs.value }}
    steps:
      - uses: actions/checkout@v4
      - id: tag
        run: echo "value=${{ inputs.image_tag || format('sha-{0}', github.sha) }}" >> "$GITHUB_OUTPUT"
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/team-beacon-slu/idsms-cis:${{ steps.tag.outputs.value }}
            ghcr.io/team-beacon-slu/idsms-cis:stable
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VM_HOST }}
          username: ${{ secrets.VM_SSH_USER }}
          key: ${{ secrets.VM_SSH_PRIVATE_KEY }}
          script: |
            set -euo pipefail
            cd /opt/idsms
            echo "IMAGE_TAG=${{ needs.build-and-push.outputs.tag }}" > .env.deploy
            docker compose --env-file .env.deploy pull app
            docker compose --env-file .env.deploy up -d --wait
```

Implementer notes:

- `--wait` blocks until the `app` healthcheck passes; a non-zero exit fails the Action, so a bad release is visible immediately.
- Rollback: re-run this workflow via **Run workflow** with `image_tag` set to a previous `sha-<...>` — no rebuild, just re-pull + re-up.
- New repo secrets required (documented in `OPERATIONS.md`, Task 6): `VM_HOST`, `VM_SSH_USER`, `VM_SSH_PRIVATE_KEY`. `GITHUB_TOKEN` is auto-provided.
- Keep `deploy.yml` effectively inert until the VM exists — until then it will fail at the SSH step, which is fine (nothing is half-deployed). Optionally comment out the `push:` trigger and rely on `workflow_dispatch` only until cutover (Task 6 runbook step).

- [ ] **Step 3: Lint the workflow YAML**

Run: `cd /c/CRACK/IDSMS-V2 && npx --yes @action-validator/cli .github/workflows/deploy.yml .github/workflows/ci.yml 2>&1 || python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print('yaml OK')" .github/workflows/deploy.yml .github/workflows/ci.yml`
Expected: validator passes, or at minimum both files parse as valid YAML.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/deploy.yml
git commit -m "$(printf 'ci: add deploy workflow (ghcr build + SSH compose up)\n\nOn push to main: reuse ci.yml, build+push an image tagged by sha and\nstable, then docker compose pull/up --wait on the VM over SSH.\nRollback via workflow_dispatch with an image_tag input.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Uj4BNAToAjvd4TJsQPoBVd')"
```

---

### Task 6: Runbooks — `OPERATIONS.md`, `docs/migration/from-supabase.md`, supersede `003`

**Files:**

- Create: `OPERATIONS.md`
- Create: `docs/migration/from-supabase.md`
- Modify: `prisma/migrations_manual/003_storage_buckets.sql` (header only)

**Interfaces:**

- Consumes: everything above (compose file, deploy workflow, env var names, secrets list).
- Produces: prose only. No code depends on this task.

- [ ] **Step 1: Write `OPERATIONS.md`** covering, as concrete numbered procedures:
  - **Owners:** the named long-term owner of the SSH deploy key and secrets (placeholder: `<faculty advisor>`); the university IT contact for VM/DNS/billing (placeholder `<IT contact>`).
  - **Deploy:** normal path = merge to `main` (auto). Manual/rollback = GitHub → Actions → Deploy → Run workflow → set `image_tag` to a `sha-<...>` from a prior green run.
  - **Secrets:** the full list (`VM_HOST`, `VM_SSH_USER`, `VM_SSH_PRIVATE_KEY` as repo secrets; `.env.production` + `POSTGRES_PASSWORD`/`MINIO_ROOT_*`/`IMAGE_TAG` on the VM at `/opt/idsms`), and how to rotate each (rotate `NEXTAUTH_SECRET` → all sessions drop, expected; never rotate `STUDENT_DEFAULT_PASSWORD_PEPPER` without a migration — it would invalidate every un-reset default password).
  - **Backups:** the two cron entries (nightly `pg_dump` + `mc mirror` to off-VM storage) and the exact restore commands; weekly cloud snapshot cadence.
  - **Health:** `https://<domain>/api/health` should return `{"status":"ok"}`; if not, `cd /opt/idsms && docker compose logs -f app`.
  - **OS:** `unattended-upgrades` enabled, auto-reboot window ~03:30; all four containers are `restart: unless-stopped` so a reboot self-heals.

- [ ] **Step 2: Write `docs/migration/from-supabase.md`** — the one-time cutover, as an ordered checklist with an explicit rollback point per stage:
  - `pg_dump "$SUPABASE_DIRECT_URL" --no-owner --no-privileges --no-acl --exclude-schema=storage --exclude-schema=auth --exclude-schema=realtime -Fc -f idsms.dump`
  - `docker compose up -d postgres` → `docker compose exec postgres psql -U idsms -d idsms -c "CREATE EXTENSION IF NOT EXISTS vector;"` → `docker compose exec -T postgres pg_restore -U idsms -d idsms --no-owner --no-privileges < idsms.dump`
  - Verification SQL: `SELECT * FROM pg_extension WHERE extname='vector';`, `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r';`, `SELECT polname, cmd FROM pg_policy WHERE polrelid='audit_logs'::regclass;`, and a row-count diff vs. a count taken on Supabase just before the dump.
  - MinIO file copy: `mc mirror` both buckets from a Supabase-Storage `mc` alias into `local/checklist-documents` and `local/moa-documents`.
  - DNS cutover is the last reversible step; old Supabase project is _paused_ (not deleted) for a 2-week grace window.

- [ ] **Step 3: Prepend the supersede header to `003_storage_buckets.sql`**

```sql
-- SUPERSEDED (2026-09-10). Buckets are now created by the `minio-init` service
-- in docker-compose.yml (mc mb checklist-documents / moa-documents). This file
-- is kept only as the record of why the two buckets exist and what MIME/size
-- policy they carry. Do not run it against the self-hosted stack.
--
```

(leave the rest of the file unchanged.)

- [ ] **Step 4: Commit**

```bash
git add OPERATIONS.md docs/migration/from-supabase.md prisma/migrations_manual/003_storage_buckets.sql
git commit -m "$(printf 'docs: VM operations runbook + Supabase cutover guide\n\nOPERATIONS.md (deploy/rollback/backup/secrets/owners) and\ndocs/migration/from-supabase.md (pg_dump/restore + mc mirror, staged\nwith rollback points). Marks 003_storage_buckets.sql superseded.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Uj4BNAToAjvd4TJsQPoBVd')"
```

---

### Task 7: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Static gates**

Run: `cd /c/CRACK/IDSMS-V2 && npm run lint && npx tsc --noEmit && npx prisma validate && npx jest --coverage && npm run build`
Expected: all green; `storage.ts` coverage ≥ 90/90/90/90; route list includes `/api/health`.

- [ ] **Step 2: Cross-file env-var consistency check**

Confirm the same names appear everywhere they must:

- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_REGION` — in `src/lib/storage.ts`, `.env.example`, `.github/workflows/ci.yml`. `NEXTAUTH_SECRET` also read by `storage.ts` (HMAC) — already present everywhere.
- `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `IMAGE_TAG` — referenced in `docker-compose.yml`, listed as compose-only in `.env.example`, documented in `OPERATIONS.md`.
- `VM_HOST`, `VM_SSH_USER`, `VM_SSH_PRIVATE_KEY` — in `deploy.yml` and `OPERATIONS.md`.
- No remaining `SUPABASE_` references anywhere except `docs/`, `PHASE*` history files, and the superseded `003` comment: `grep -rn "SUPABASE\|supabase-js" --include='*.ts' --include='*.yml' --include='*.mjs' src .github next.config.mjs .env.example` returns nothing live.

- [ ] **Step 3: Docker artifacts sanity**

If Docker is available: `docker build -t idsms:verify . && docker compose config >/dev/null && echo OK`.
If not: confirm `Dockerfile` matches the Next.js standalone reference (copies `.next/standalone`, `.next/static`, `public`, `prisma`; non-root; `CMD ["node","server.js"]`) and `docker-compose.yml` parses as YAML.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feature/vm-migration-artifacts
gh pr create --base develop --title "Self-hosted VM migration — artifacts" --body "$(cat <<'EOF'
Produces every file needed to run IDSMS-CIS on a self-hosted VM. No live
infra touched — apply after the university confirms its institutional
Azure/AWS subscription (see docs/migration/from-supabase.md).

## What's here
- `Dockerfile` + `output: "standalone"` + `.dockerignore`
- `docker-compose.yml` (caddy / app / postgres+pgvector / minio) + `Caddyfile`
- `src/lib/storage.ts` rewritten Supabase Storage -> MinIO/S3 (same exports)
- `/api/health`, `.github/workflows/deploy.yml`, `OPERATIONS.md`, cutover runbook

## Test plan
- [ ] lint, tsc, prisma validate, jest (storage.ts >=90% coverage), build all green
- [ ] `docker build` + `docker compose config` valid
- [ ] no live `SUPABASE_*` / `supabase-js` references remain
- [ ] call sites of `@/lib/storage` unchanged; `checklistService.test.ts` untouched

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage** — every "Code changes" item in the design doc maps to a task: (1) `next.config.mjs` → T1; (2) `Dockerfile`/`.dockerignore` → T1; (3) `docker-compose.yml`/`Caddyfile` → T3; (4) `storage.ts` rewrite → T2; (5) `.env.example` vars → T3; (6) `/api/health` → T4; (7) `deploy.yml` → T5. Plus data-migration + handoff runbooks → T6, verification → T7.

**Placeholder scan** — the one intentional open item is Task 2 Step 0 (the `getSignedUrl` delivery decision), which is a flagged architect decision with two fully-specified options, not a "TBD". Domain names are `idsms.example.edu` placeholders, called out for replacement at deploy time.

**Type consistency** — `storage.ts` exports match Global Constraints verbatim; `getSignedUrl`'s `(bucket, path, expiresInSeconds=300)` matches the current signature; the health route exports `GET` with no args, matching its test.
