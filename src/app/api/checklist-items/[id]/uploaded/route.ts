import { NextRequest, NextResponse } from "next/server";
import { markChecklistItemUploaded } from "@/lib/services/predeployment/checklistService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// The intern marks one requirement "Uploaded to Classroom" (027). Owner-only, checked in
// markChecklistItemUploaded. No file comes here: documents stay in Google Classroom (D7).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    const item = await markChecklistItemUploaded(
      params.id,
      user,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json({ id: item.id, uploadedAt: item.uploadedAt });
  } catch (error) {
    return handleApiError(error);
  }
}
