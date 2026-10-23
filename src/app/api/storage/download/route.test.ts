/** @jest-environment node */
// The S3 (MinIO) driver, selected before storage.ts is imported.
import "@/testUtils/s3Driver";

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
jest.mock("@aws-sdk/client-s3", () => {
  const send = jest.fn();
  return {
    S3Client: jest.fn(() => ({ send })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    __send: send,
  };
});

import { NextRequest } from "next/server";
import * as sdk from "@aws-sdk/client-s3";
import { CHECKLIST_BUCKET, getSignedUrl, signDownload } from "@/lib/storage";
import { GET } from "./route";

const send = (sdk as unknown as { __send: jest.Mock }).__send;
beforeEach(() => send.mockReset());

const get = (url: string) => GET(new NextRequest(url));

it("streams the object for a valid signed link", async () => {
  send.mockResolvedValue({
    ContentType: "application/pdf",
    Body: { transformToWebStream: () => new Blob(["%PDF-1"]).stream() },
  });
  const res = await get(await getSignedUrl(CHECKLIST_BUCKET, "p/a.pdf"));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  await expect(res.text()).resolves.toBe("%PDF-1");
  expect(send.mock.calls[0][0].input).toEqual({ Bucket: CHECKLIST_BUCKET, Key: "p/a.pdf" });
});

it("refuses a link whose key was changed", async () => {
  const url = new URL(await getSignedUrl(CHECKLIST_BUCKET, "p/a.pdf"));
  url.searchParams.set("k", "p/someone-else.pdf");
  expect((await get(url.toString())).status).toBe(403);
  expect(send).not.toHaveBeenCalled();
});

it("refuses a bucket outside the allow-list even with a valid signature", async () => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  const sig = signDownload("secrets", "x", exp);
  const res = await get(
    `https://idsms.example.edu/api/storage/download?b=secrets&k=x&exp=${exp}&sig=${sig}`
  );
  expect(res.status).toBe(403);
});

it("answers 404 when the object is missing", async () => {
  send.mockRejectedValue(new Error("NoSuchKey"));
  expect((await get(await getSignedUrl(CHECKLIST_BUCKET, "p/gone.pdf"))).status).toBe(404);
});
