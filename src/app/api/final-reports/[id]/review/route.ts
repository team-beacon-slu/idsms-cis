import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import {
  FINAL_REPORT_REVIEWERS,
  reviewFinalReport,
} from "@/lib/services/reports/finalReportService";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream H (FR-FT-03): coordinator / Super Admin approve or return.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, FINAL_REPORT_REVIEWERS);
    await reviewFinalReport(params.id, await req.json(), user, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
