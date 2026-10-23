import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Mirrors src/lib/prisma.ts's globalThis-cached singleton pattern, for the
// same reason: Next.js dev-mode hot-reload would otherwise create a fresh
// client (and connection) on every save.
const globalForSupabase = globalThis as unknown as { supabaseAdmin?: SupabaseClient };

export const supabaseAdmin: SupabaseClient =
  globalForSupabase.supabaseAdmin ??
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalForSupabase.supabaseAdmin = supabaseAdmin;
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

  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });

  if (error) {
    throw new InvalidFileError(error.message);
  }

  return path;
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

  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, pdf, {
    upsert: true,
    contentType: "application/pdf",
  });

  if (error) {
    throw new InvalidFileError(error.message);
  }

  return path;
}

export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 300
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

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
  const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);
  if (error && !/not found/i.test(error.message)) throw new StorageDeleteError(error.message);
}
