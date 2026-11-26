import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/session";
import { renderWeeklyReportsBatch } from "@/lib/services/reports/batchPrintService";
import { handleApiError } from "@/lib/utils/apiError";

// Batch print: approved Weekly Work Reports of the given interns as one PDF. Anyone who can
// see an intern may print that intern's reports (the service checks each one).
export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ studentProfileIds: z.array(z.uuid()).min(1).max(100) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const { studentProfileIds } = schema.parse(await req.json());
    const pdf = await renderWeeklyReportsBatch([...new Set(studentProfileIds)], user);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Weekly Work Reports.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
