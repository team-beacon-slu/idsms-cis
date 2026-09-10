import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3, verifyDownloadSig, CHECKLIST_BUCKET, MOA_BUCKET } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS = new Set([CHECKLIST_BUCKET, MOA_BUCKET]);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const bucket = p.get("b") ?? "";
  const key = p.get("k") ?? "";
  const exp = Number(p.get("exp"));
  const sig = p.get("sig") ?? "";

  if (!ALLOWED_BUCKETS.has(bucket) || !key || !verifyDownloadSig(bucket, key, exp, sig)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!obj.Body) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(obj.Body.transformToWebStream(), {
      headers: {
        "Content-Type": obj.ContentType ?? "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
