import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { submitCompanyEvaluation } from "@/lib/services/predeployment/companyEvaluationService";
import { handleApiError } from "@/lib/utils/apiError";

// Company view: the intern evaluates their host company (the service checks the role and hours).
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    const created = await submitCompanyEvaluation(
      params.studentProfileId,
      await req.json(),
      user,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
