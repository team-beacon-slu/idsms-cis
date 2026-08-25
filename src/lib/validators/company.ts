import { z } from "zod";
import { MoaStatus, Program, WorkModality } from "@prisma/client";

export const createCompanySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  address: z.string().min(1, "Address is required"),
  workModality: z.enum(WorkModality),
  supervisorName: z.string().min(1, "Supervisor name is required"),
  supervisorContact: z.string().min(1, "Supervisor contact is required"),
  // Only meaningful when the caller is (or is acting on behalf of) a student —
  // see companyService.createCompany.
  positionTitle: z.string().min(1).optional(),
  linkToStudentProfileId: z.uuid().optional(),
});

export const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  workModality: z.enum(WorkModality).optional(),
  supervisorName: z.string().min(1).optional(),
  supervisorContact: z.string().min(1).optional(),
});

export const setCompanyVerifiedSchema = z.object({
  isVerified: z.boolean(),
});

// Validated against the route's *assembled* object (after it resolves
// whether the request carried a link or an uploaded file), not the raw
// request body — that's what lets .refine() enforce "exactly one of
// documentUrl/documentPath" as an ordinary ZodError (mapped to 400 by
// handleApiError) instead of inventing a parallel validation-error type.
export const createMoaRecordSchema = z
  .object({
    companyId: z.uuid(),
    documentUrl: z.url().optional(),
    documentPath: z.string().min(1).optional(),
    validFrom: z.coerce.date(),
    validTo: z.coerce.date(),
    programsCovered: z.array(z.enum(Program)).min(1, "Select at least one program"),
  })
  .refine((data) => Boolean(data.documentUrl) !== Boolean(data.documentPath), {
    message: "Provide either a document link or an uploaded file, not both or neither",
    path: ["documentUrl"],
  })
  .refine((data) => data.validTo > data.validFrom, {
    message: "validTo must be after validFrom",
    path: ["validTo"],
  });

export const updateMoaStatusSchema = z.object({
  status: z.enum(MoaStatus),
});

export const listCompaniesQuerySchema = z.object({
  search: z.string().optional(),
});
