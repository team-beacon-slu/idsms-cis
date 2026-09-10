/**
 * @jest-environment node
 */
// Runs in the node env: storage.ts is server-only (node:crypto, Buffer,
// File.arrayBuffer()) and jsdom's File has no arrayBuffer().
//
// S3Client / commands are constructed at import time in storage.ts's singleton,
// so the SDK must be mockable without real credentials. The mock fns are created
// *inside* the factory (import statements are ESM-hoisted above any top-level
// const, so a factory that closed over an outer `const mockSend` would hit its
// TDZ when storage.ts is required). We hand the send mock back out via a
// `__mockSend` key and grab it after the import.
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

import { createHmac } from "node:crypto";
import * as s3sdk from "@aws-sdk/client-s3";
import {
  CHECKLIST_BUCKET,
  MOA_BUCKET,
  InvalidFileError,
  getSignedUrl,
  uploadFile,
  validateUpload,
  verifyDownloadSig,
} from "@/lib/storage";

const mockSend = (s3sdk as unknown as { __mockSend: jest.Mock }).__mockSend;
const PutObjectCommand = s3sdk.PutObjectCommand as unknown as jest.Mock;

function makeFile(sizeBytes: number, type: string) {
  return new File([new Uint8Array(sizeBytes)], "file", { type });
}

beforeEach(() => {
  mockSend.mockReset();
  PutObjectCommand.mockClear();
});

describe("validateUpload", () => {
  it("accepts a PDF under the 5MB cap", () => {
    expect(() => validateUpload(makeFile(1024, "application/pdf"))).not.toThrow();
  });
  it("accepts a JPEG under the 2MB cap", () => {
    expect(() => validateUpload(makeFile(1024, "image/jpeg"))).not.toThrow();
  });
  it("accepts a PNG under the 2MB cap", () => {
    expect(() => validateUpload(makeFile(1024, "image/png"))).not.toThrow();
  });
  it("rejects an unsupported mime type", () => {
    expect(() => validateUpload(makeFile(1024, "application/zip"))).toThrow(InvalidFileError);
  });
  it("names 'unknown' when the file has no mime type", () => {
    expect(() => validateUpload(makeFile(1024, ""))).toThrow(/unknown/);
  });
  it("rejects a PDF over the 5MB cap", () => {
    expect(() => validateUpload(makeFile(5 * 1024 * 1024 + 1, "application/pdf"))).toThrow(
      InvalidFileError
    );
  });
  it("rejects an image over the 2MB cap using the image limit", () => {
    expect(() => validateUpload(makeFile(2 * 1024 * 1024 + 1, "image/png"))).toThrow(/2MB limit/);
  });
});

describe("uploadFile", () => {
  it("validates before ever calling S3", async () => {
    await expect(
      uploadFile(CHECKLIST_BUCKET, "path.zip", makeFile(10, "application/zip"))
    ).rejects.toThrow(InvalidFileError);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("puts the object with its content type and returns the path", async () => {
    mockSend.mockResolvedValue({});
    const result = await uploadFile(
      CHECKLIST_BUCKET,
      "profile-1/x.pdf",
      makeFile(10, "application/pdf")
    );
    expect(result).toBe("profile-1/x.pdf");
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: CHECKLIST_BUCKET,
        Key: "profile-1/x.pdf",
        ContentType: "application/pdf",
      })
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("wraps an S3 error as InvalidFileError", async () => {
    mockSend.mockRejectedValue(new Error("bucket not found"));
    await expect(
      uploadFile(CHECKLIST_BUCKET, "profile-1/x.pdf", makeFile(10, "application/pdf"))
    ).rejects.toThrow(/bucket not found/);
  });
});

describe("getSignedUrl (Option B — same-origin proxy URL)", () => {
  it("returns a /api/storage/download URL carrying bucket, key, exp and a sig", async () => {
    const url = await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf");
    const parsed = new URL(url, "http://x");
    expect(parsed.pathname).toBe("/api/storage/download");
    expect(parsed.searchParams.get("b")).toBe(CHECKLIST_BUCKET);
    expect(parsed.searchParams.get("k")).toBe("profile-1/x.pdf");
    expect(Number(parsed.searchParams.get("exp"))).toBeGreaterThan(Date.now() / 1000);
    expect(parsed.searchParams.get("sig")).toBeTruthy();
  });
  it("honours a custom expiry window", async () => {
    const before = Math.floor(Date.now() / 1000);
    const url = await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf", 60);
    const exp = Number(new URL(url, "http://x").searchParams.get("exp"));
    expect(exp).toBeGreaterThanOrEqual(before + 59);
    expect(exp).toBeLessThanOrEqual(before + 61);
  });
  it("produces a sig that verifyDownloadSig accepts, and rejects a tampered one", async () => {
    const url = await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf");
    const q = new URL(url, "http://x").searchParams;
    const exp = Number(q.get("exp"));
    expect(verifyDownloadSig(CHECKLIST_BUCKET, "profile-1/x.pdf", exp, q.get("sig")!)).toBe(true);
    expect(verifyDownloadSig(CHECKLIST_BUCKET, "profile-1/x.pdf", exp, "tampered")).toBe(false);
    expect(verifyDownloadSig(MOA_BUCKET, "profile-1/x.pdf", exp, q.get("sig")!)).toBe(false);
  });
  it("verifyDownloadSig rejects an expired exp", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    // getSignedUrl always future-dates exp, so sign inline for a past exp here:
    const sig = createHmac("sha256", process.env.NEXTAUTH_SECRET!)
      .update(`${CHECKLIST_BUCKET}:k:${past}`)
      .digest("base64url");
    expect(verifyDownloadSig(CHECKLIST_BUCKET, "k", past, sig)).toBe(false);
  });
  it("verifyDownloadSig rejects NaN exp", () => {
    expect(verifyDownloadSig(CHECKLIST_BUCKET, "k", NaN, "anything")).toBe(false);
  });
  it("verifyDownloadSig rejects non-finite exp (Infinity)", () => {
    expect(verifyDownloadSig(CHECKLIST_BUCKET, "k", Infinity, "anything")).toBe(false);
  });
});
