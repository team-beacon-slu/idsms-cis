import { NextResponse } from "next/server";

// A PDF download under SLU's file name (sluFileName), e.g. "WWR01 DelaCruzJuan.pdf".
export function pdfResponse(pdf: Buffer, fileName: string): NextResponse {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w .-]/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
