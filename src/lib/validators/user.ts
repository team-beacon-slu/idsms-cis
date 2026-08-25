import { z } from "zod";
import { Program, Role } from "@prisma/client";

export const createUserSchema = z.object({
  email: z.email(),
  role: z.enum(Role),
});

// Role reassignment isn't exposed here — it has no dedicated service-layer
// audit/session-revocation semantics yet, unlike isActive (setUserActive).
export const updateUserSchema = z.object({
  isActive: z.boolean(),
});

// One row of a bulk-import spreadsheet. The class group and semester the
// import targets are chosen once in the upload form, not per row — a "class
// list" is already scoped to a single class group/semester by definition.
export const bulkImportRowSchema = z.object({
  studentNumber: z.string().min(1, "Student number is required"),
  email: z.email(),
  program: z.enum(Program),
  requiredHours: z.coerce.number().int().positive(),
});

export const bulkImportRequestSchema = z.object({
  classGroupId: z.uuid(),
  semesterId: z.uuid(),
});

export type BulkImportRow = z.infer<typeof bulkImportRowSchema>;
