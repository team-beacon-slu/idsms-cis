import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { createDataRequest } from "@/lib/services/dataRequestService";
import { getSuperAdminIds } from "@/lib/services/notificationRecipients";
import { notify } from "@/lib/services/notify";
import { formatManilaDateTime } from "@/lib/utils/excelExport";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

// NFR-DP-07: any signed-in user asks for a copy of their own data. The
// requester is always the session user; nothing in the request names a subject.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const ipAddress = req.headers.get("x-forwarded-for");
    const { id, dueAt } = await createDataRequest(user.id, ipAddress);

    // After commit; notify() never throws.
    await notify({
      userIds: await getSuperAdminIds(),
      trigger: "DSAR_REQUESTED",
      title: "New data request",
      body: `${user.email} asked for a copy of their personal data. Due ${formatManilaDateTime(dueAt).slice(0, 10)}.`,
      link: "/admin/export-center#data-requests",
      email: true,
    });

    return NextResponse.json({ id, dueAt }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
