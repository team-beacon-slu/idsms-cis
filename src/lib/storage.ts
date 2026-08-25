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

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export class InvalidFileError extends Error {
  constructor(message = "Invalid file") {
    super(message);
    this.name = "InvalidFileError";
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

  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type,
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
