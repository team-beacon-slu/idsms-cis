import { NextRequest, NextResponse } from "next/server";
import { uploadChecklistItemFile } from "@/lib/services/checklistService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// Ownership (student self-only) is enforced inside uploadChecklistItemFile
// via assertCanAccessStudent — no route-level role gate needed beyond auth.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const ipAddress = req.headers.get("x-forwarded-for");
    const item = await uploadChecklistItemFile(params.id, file, user, ipAddress);
    return NextResponse.json(item);
  } catch (error) {
    return handleApiError(error);
  }
}
