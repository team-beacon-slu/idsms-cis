import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Where files live: Supabase Storage today, the lab server's MinIO (S3 API) in
// Phase 5. Every file goes through this module, so switching is one env var.
export const STORAGE_DRIVER: "supabase" | "s3" =
  process.env.STORAGE_DRIVER === "s3" ? "s3" : "supabase";

// globalThis-cached like src/lib/prisma.ts: dev hot-reload would otherwise open
// a fresh client on every save. Only the active driver's client is created, so
// each host needs only its own credentials.
const g = globalThis as unknown as { supabaseAdmin?: SupabaseClient; s3?: S3Client };

const supabaseAdmin: SupabaseClient | null =
  STORAGE_DRIVER === "supabase"
    ? (g.supabaseAdmin ??= createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      ))
    : null;

export function s3(): S3Client {
  return (g.s3 ??= new S3Client({
    endpoint: process.env.MINIO_ENDPOINT!,
    region: process.env.MINIO_REGION ?? "us-east-1",
    forcePathStyle: true, // MinIO has no wildcard-subdomain DNS
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
  }));
}

export const CHECKLIST_BUCKET = "checklist-documents";
export const MOA_BUCKET = "moa-documents";
export const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
// The browser sets file.type from the extension, so a renamed file passes it;
// the first bytes say what the file really is.
const SIGNATURES: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
};

export class InvalidFileError extends Error {
  constructor(message = "Invalid file") {
    super(message);
    this.name = "InvalidFileError";
  }
}

// Deterministic: re-rendering the same content yields the same size, so the
// PDF retry loop must not retry it.
export class PdfTooLargeError extends InvalidFileError {
  constructor(message: string) {
    super(message);
    this.name = "PdfTooLargeError";
  }
}

// NFR-SEC-03 / Phase 4's file-size-cap task pulled forward as defense-in-depth
// from day one — leaving Storage uncapped for two phases isn't worth the risk.
export function validateUpload(file: File): void {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new InvalidFileError(`Unsupported file type: ${file.type || "unknown"}`);
  }

  const maxBytes = file.type === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    throw new InvalidFileError(`File exceeds the ${maxBytes / (1024 * 1024)}MB limit`);
  }
}

// upsert:true so a Return -> re-upload cycle overwrites in place rather than
// accumulating orphaned versions against the 1GB free-tier cap.
export async function uploadFile(bucket: string, path: string, file: File): Promise<string> {
  validateUpload(file);
  const signature = SIGNATURES[file.type];
  const head = new Uint8Array(await file.slice(0, signature.length).arrayBuffer());
  if (!signature.every((byte, i) => head[i] === byte)) {
    throw new InvalidFileError("The file's contents don't match its type");
  }

  await putObject(bucket, path, file, file.type);
  return path;
}

// Both drivers overwrite in place (Supabase upsert:true; S3 PutObject always does).
async function putObject(bucket: string, path: string, body: File | Buffer, contentType: string) {
  if (STORAGE_DRIVER === "s3") {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(await (body as File).arrayBuffer());
    try {
      await s3().send(
        new PutObjectCommand({ Bucket: bucket, Key: path, Body: bytes, ContentType: contentType })
      );
    } catch (err) {
      throw new InvalidFileError(err instanceof Error ? err.message : "Upload failed");
    }
    return;
  }
  const { error } = await supabaseAdmin!.storage
    .from(bucket)
    .upload(path, body, { upsert: true, contentType });
  if (error) {
    throw new InvalidFileError(error.message);
  }
}

// Server-generated PDFs (Module 8) arrive as Buffers, not browser Files, so
// validateUpload()'s File-based MIME check doesn't apply — the content type
// is fixed here and only the size cap needs enforcing.
export async function uploadPdfBuffer(bucket: string, path: string, pdf: Buffer): Promise<string> {
  if (pdf.byteLength > MAX_PDF_BYTES) {
    throw new PdfTooLargeError(
      `Generated PDF exceeds the ${MAX_PDF_BYTES / (1024 * 1024)}MB limit`
    );
  }

  await putObject(bucket, path, pdf, "application/pdf");
  return path;
}

// S3 driver: links point at our own /api/storage/download route, which checks
// this signature, so MinIO is never exposed to the browser.
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

export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 300,
  // Saves under this name (an SLU file name) instead of opening inline under the key.
  downloadAs?: string
): Promise<string> {
  if (STORAGE_DRIVER === "s3") {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const qs = new URLSearchParams({
      b: bucket,
      k: path,
      exp: String(exp),
      sig: signDownload(bucket, path, exp),
      ...(downloadAs ? { n: downloadAs } : {}),
    });
    // Absolute, because NextResponse.redirect (deviation proofs) rejects relative URLs.
    return new URL(`/api/storage/download?${qs}`, process.env.NEXTAUTH_URL).toString();
  }
  const { data, error } = await supabaseAdmin!.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds, downloadAs ? { download: downloadAs } : undefined);

  if (error || !data) {
    throw new InvalidFileError(error?.message ?? "Failed to create signed URL");
  }

  return data.signedUrl;
}

export class StorageDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageDeleteError";
  }
}

// Idempotent: a missing object is success, so a retried delete (or one whose
// object is already gone) doesn't fail the caller.
export async function deleteObject(bucket: string, path: string): Promise<void> {
  if (STORAGE_DRIVER === "s3") {
    try {
      // S3 treats deleting a missing key as success, which matches the contract.
      await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
    } catch (err) {
      throw new StorageDeleteError(err instanceof Error ? err.message : "Delete failed");
    }
    return;
  }
  const { error } = await supabaseAdmin!.storage.from(bucket).remove([path]);
  if (error && !/not found/i.test(error.message)) throw new StorageDeleteError(error.message);
}
