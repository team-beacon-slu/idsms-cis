import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { setCompanyReply } from "@/lib/services/predeployment/companyEvaluationService";
import { handleApiError } from "@/lib/utils/apiError";

// Company view: the coordinator records the company's reply (the service checks the role).
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    await setCompanyReply(params.id, await req.json(), user, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
