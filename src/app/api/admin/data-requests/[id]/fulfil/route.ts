import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { markDataRequestFulfilled } from "@/lib/services/dataRequestService";
import { notify } from "@/lib/services/notify";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

// NFR-DP-07: the Super Admin marks the request done after sending the file.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);

    const id = z.string().uuid().parse(params.id);
    const { userId } = await markDataRequestFulfilled(id, user.id);

    // After commit; notify() never throws.
    await notify({
      userIds: [userId],
      trigger: "DSAR_FULFILLED",
      title: "Your data request is complete",
      body: "The Super Admin has prepared your data. They will send you the file.",
      link: "/profile",
      email: true,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
