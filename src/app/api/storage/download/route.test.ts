/**
 * @jest-environment node
 */
// The route streams bytes via the AWS SDK v3 GetObjectCommand response Body
// (a SdkStream with transformToWebStream()). Mock the SDK so no MinIO/creds
// are needed. Mock fns are created inside the factory (import statements are
// ESM-hoisted above any top-level const, which would put an outer `const
// mockSend` in its TDZ when storage.ts is required); the send mock is handed
// back out via `__mockSend`.
jest.mock("@aws-sdk/client-s3", () => {
  const send = jest.fn();
  return {
    __esModule: true,
    __mockSend: send,
    S3Client: jest.fn(() => ({ send })),
    PutObjectCommand: jest.fn((input) => ({ __type: "Put", input })),
    GetObjectCommand: jest.fn((input) => ({ __type: "Get", input })),
  };
});

process.env.NEXTAUTH_SECRET = "test-secret-for-hmac";

import { NextRequest } from "next/server";
import * as s3sdk from "@aws-sdk/client-s3";
import { GET } from "./route";
import { CHECKLIST_BUCKET, signDownload } from "@/lib/storage";

const mockSend = (s3sdk as unknown as { __mockSend: jest.Mock }).__mockSend;

function makeReq(params: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return { nextUrl: new URL(`http://localhost/api/storage/download?${qs}`) } as NextRequest;
}

const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  mockSend.mockReset();
});

describe("GET /api/storage/download (Option B proxy)", () => {
  it("403s on a tampered signature", async () => {
    const exp = nowSec() + 300;
    const res = await GET(
      makeReq({ b: CHECKLIST_BUCKET, k: "profile-1/x.pdf", exp: String(exp), sig: "tampered" })
    );
    expect(res.status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("403s on an expired exp even with an otherwise-valid signature", async () => {
    const exp = nowSec() - 10;
    const sig = signDownload(CHECKLIST_BUCKET, "profile-1/x.pdf", exp);
    const res = await GET(
      makeReq({ b: CHECKLIST_BUCKET, k: "profile-1/x.pdf", exp: String(exp), sig })
    );
    expect(res.status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("403s when the bucket is not in the allow-list", async () => {
    const exp = nowSec() + 300;
    const sig = signDownload("evil-bucket", "profile-1/x.pdf", exp);
    const res = await GET(
      makeReq({ b: "evil-bucket", k: "profile-1/x.pdf", exp: String(exp), sig })
    );
    expect(res.status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("200s and streams the object body on a valid request", async () => {
    mockSend.mockResolvedValue({
      Body: { transformToWebStream: () => new ReadableStream() },
      ContentType: "application/pdf",
    });
    const exp = nowSec() + 300;
    const sig = signDownload(CHECKLIST_BUCKET, "profile-1/x.pdf", exp);
    const res = await GET(
      makeReq({ b: CHECKLIST_BUCKET, k: "profile-1/x.pdf", exp: String(exp), sig })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(res.body).toBeTruthy();
  });

  it("403s on a non-numeric exp without calling S3", async () => {
    const sig = "ignored";
    const res = await GET(makeReq({ b: CHECKLIST_BUCKET, k: "profile-1/x.pdf", exp: "abc", sig }));
    expect(res.status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("404s when S3 returns no Body", async () => {
    mockSend.mockResolvedValue({ ContentType: "application/pdf" });
    const exp = nowSec() + 300;
    const sig = signDownload(CHECKLIST_BUCKET, "profile-1/x.pdf", exp);
    const res = await GET(
      makeReq({ b: CHECKLIST_BUCKET, k: "profile-1/x.pdf", exp: String(exp), sig })
    );
    expect(res.status).toBe(404);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("404s when S3 send rejects", async () => {
    mockSend.mockRejectedValue(new Error("NoSuchKey"));
    const exp = nowSec() + 300;
    const sig = signDownload(CHECKLIST_BUCKET, "profile-1/x.pdf", exp);
    const res = await GET(
      makeReq({ b: CHECKLIST_BUCKET, k: "profile-1/x.pdf", exp: String(exp), sig })
    );
    expect(res.status).toBe(404);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
