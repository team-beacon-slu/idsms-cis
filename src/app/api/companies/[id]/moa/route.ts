import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { createMoaRecordSchema } from "@/lib/validators/company";
import { createMoaRecord, listMoaRecordsForCompany } from "@/lib/services/companyService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";
import { MOA_BUCKET, uploadFile } from "@/lib/storage";

// FR-MOA-07: MOA record access — create and view — is Faculty/Coordinator/
// Admin only, never students.
const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, STAFF_ROLES);
    const records = await listMoaRecordsForCompany(params.id);
    return NextResponse.json({ records });
  } catch (error) {
    return handleApiError(error);
  }
}

// Accepts either multipart/form-data (an uploaded PDF) or application/json
// (a Google Drive link, FR-MOA-03) — the assembled object is what actually
// gets validated, so createMoaRecordSchema's "exactly one of
// documentUrl/documentPath" refine applies uniformly either way.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, STAFF_ROLES);

    const contentType = req.headers.get("content-type") ?? "";
    let assembled: Record<string, unknown>;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
      }

      // The record's id is needed to build the Storage path before the
      // record exists — generated here, passed through to createMoaRecord,
      // which uses it as the row's own primary key.
      const moaId = randomUUID();
      const extension = EXTENSION_BY_MIME[file.type] ?? "bin";
      const path = `${params.id}/${moaId}.${extension}`;
      await uploadFile(MOA_BUCKET, path, file);

      assembled = {
        id: moaId,
        companyId: params.id,
        documentPath: path,
        validFrom: formData.get("validFrom"),
        validTo: formData.get("validTo"),
        programsCovered: formData.getAll("programsCovered"),
      };
    } else {
      const body = await req.json();
      assembled = { ...body, companyId: params.id };
    }

    const validated = createMoaRecordSchema.parse(assembled);
    const ipAddress = req.headers.get("x-forwarded-for");
    const moaRecord = await createMoaRecord(validated, user.id, ipAddress);
    return NextResponse.json(moaRecord, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
