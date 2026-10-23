/** @jest-environment node */
// The S3 (MinIO) driver, selected before storage.ts is imported.
import "@/testUtils/s3Driver";

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
jest.mock("@aws-sdk/client-s3", () => {
  const send = jest.fn();
  const command = (name: string) => jest.fn().mockImplementation((input) => ({ name, input }));
  return {
    S3Client: jest.fn(() => ({ send })),
    PutObjectCommand: command("put"),
    DeleteObjectCommand: command("delete"),
    GetObjectCommand: command("get"),
    __send: send,
  };
});

import { createClient } from "@supabase/supabase-js";
import * as sdk from "@aws-sdk/client-s3";
import {
  CHECKLIST_BUCKET,
  InvalidFileError,
  STORAGE_DRIVER,
  StorageDeleteError,
  deleteObject,
  getSignedUrl,
  uploadFile,
  uploadPdfBuffer,
  verifyDownloadSig,
} from "@/lib/storage";

const send = (sdk as unknown as { __send: jest.Mock }).__send;

beforeEach(() => send.mockReset());

function pdfFile() {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "a.pdf", {
    type: "application/pdf",
  });
}

it("uses S3 and never creates a Supabase client", () => {
  expect(STORAGE_DRIVER).toBe("s3");
  expect(createClient).not.toHaveBeenCalled();
});

it("uploads a checked file to the bucket with its content type", async () => {
  send.mockResolvedValue({});
  await expect(uploadFile(CHECKLIST_BUCKET, "p/a.pdf", pdfFile())).resolves.toBe("p/a.pdf");
  const [cmd] = send.mock.calls[0];
  expect(cmd.name).toBe("put");
  expect(cmd.input).toMatchObject({
    Bucket: CHECKLIST_BUCKET,
    Key: "p/a.pdf",
    ContentType: "application/pdf",
  });
  expect(Buffer.isBuffer(cmd.input.Body)).toBe(true);
});

it("keeps the content check: a renamed file is rejected before reaching S3", async () => {
  const fake = new File([new Uint8Array([1, 2, 3, 4])], "x.pdf", { type: "application/pdf" });
  await expect(uploadFile(CHECKLIST_BUCKET, "p/x.pdf", fake)).rejects.toThrow(InvalidFileError);
  expect(send).not.toHaveBeenCalled();
});

it("turns an S3 failure into InvalidFileError", async () => {
  send.mockRejectedValue(new Error("bucket missing"));
  await expect(uploadPdfBuffer(CHECKLIST_BUCKET, "g.pdf", Buffer.from("%PDF"))).rejects.toThrow(
    "bucket missing"
  );
});

it("signs an absolute download link that verifies, and rejects tampering or expiry", async () => {
  const url = new URL(await getSignedUrl(CHECKLIST_BUCKET, "p/a.pdf", 60));
  expect(url.origin).toBe("https://idsms.example.edu");
  expect(url.pathname).toBe("/api/storage/download");
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig")!;
  expect(verifyDownloadSig(CHECKLIST_BUCKET, "p/a.pdf", exp, sig)).toBe(true);
  expect(verifyDownloadSig(CHECKLIST_BUCKET, "p/other.pdf", exp, sig)).toBe(false);
  expect(
    verifyDownloadSig(CHECKLIST_BUCKET, "p/a.pdf", Math.floor(Date.now() / 1000) - 1, sig)
  ).toBe(false);
});

it("deletes through S3 and reports failures as StorageDeleteError", async () => {
  send.mockResolvedValueOnce({});
  await deleteObject(CHECKLIST_BUCKET, "p/a.pdf");
  expect(send.mock.calls[0][0]).toMatchObject({
    name: "delete",
    input: { Bucket: CHECKLIST_BUCKET, Key: "p/a.pdf" },
  });
  send.mockRejectedValueOnce(new Error("denied"));
  await expect(deleteObject(CHECKLIST_BUCKET, "p/a.pdf")).rejects.toThrow(StorageDeleteError);
});
