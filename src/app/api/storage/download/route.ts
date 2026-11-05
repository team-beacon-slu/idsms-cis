import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  CHECKLIST_BUCKET,
  GENERATED_DOCUMENTS_BUCKET,
  MOA_BUCKET,
  STORAGE_DRIVER,
  s3,
  verifyDownloadSig,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS = new Set([CHECKLIST_BUCKET, MOA_BUCKET, GENERATED_DOCUMENTS_BUCKET]);

// Serves files for the S3 (MinIO) driver. The link itself is the permission:
// getSignedUrl signs bucket, key and expiry, so no session is needed here.
export async function GET(req: NextRequest) {
  if (STORAGE_DRIVER !== "s3") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const p = req.nextUrl.searchParams;
  const bucket = p.get("b") ?? "";
  const key = p.get("k") ?? "";
  const exp = Number(p.get("exp"));
  const sig = p.get("sig") ?? "";
  // Unsigned on purpose: it only names the saved file, so it is reduced to safe characters.
  const name = p.get("n")?.replace(/[^\w .-]/g, "");

  let valid = false;
  try {
    valid = ALLOWED_BUCKETS.has(bucket) && key !== "" && verifyDownloadSig(bucket, key, exp, sig);
  } catch {
    // NEXTAUTH_SECRET unset: createHmac throws, so fail closed.
  }
  if (!valid) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const obj = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!obj.Body) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(obj.Body.transformToWebStream(), {
      headers: {
        "Content-Type": obj.ContentType ?? "application/octet-stream",
        "Content-Disposition": name ? `attachment; filename="${name}"` : "inline",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
