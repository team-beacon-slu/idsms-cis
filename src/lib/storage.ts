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
// Note: The `bucket:path:exp` message is unescaped; this is safe because the HMAC
// covers bucket and path, buckets are allow-listed in the route, and only the app
// signs keys (no user-supplied key reaches signDownload).
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
