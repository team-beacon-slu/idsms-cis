import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { findSimilarCompanies } from "@/lib/services/predeployment/companyService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-MOA-02: any signed-in user, same as the company list (companies aren't sensitive).
export async function GET(req: NextRequest) {
  try {
    await requireUserApi();
    const name = (req.nextUrl.searchParams.get("name") ?? "").slice(0, 200);
    return NextResponse.json({ companies: await findSimilarCompanies(name) });
  } catch (error) {
    return handleApiError(error);
  }
}
