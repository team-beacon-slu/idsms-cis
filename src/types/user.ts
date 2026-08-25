import { Role } from "@prisma/client";

// User minus hashedPassword — the shape safe to send to a client.
export interface SafeUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustResetPassword: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
}

export interface BulkImportRowResult {
  rowNumber: number;
  studentNumber: string;
  email: string;
  status: "created" | "skipped";
  // Only ever present in the response body of the import call itself, never
  // persisted or logged — see defaultPassword.ts / the Phase 1 plan's FR-UM-03 note.
  temporaryPassword?: string;
  reason?: string;
}

export interface BulkImportResult {
  totalRows: number;
  created: number;
  skipped: number;
  results: BulkImportRowResult[];
}
