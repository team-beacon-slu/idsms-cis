/** @jest-environment node */
// createClient is mocked at the module boundary — storage.ts calls it at
// import time (top-level singleton, mirroring src/lib/prisma.ts), so real
// Supabase credentials must never be required just to import this module in
// tests. The mock fns are declared *inside* the factory (not hoisted consts
// referenced from it) because Jest hoists jest.mock() above the imports that
// trigger it, which would otherwise read them before initialization.
jest.mock("@supabase/supabase-js", () => {
  const mockUpload = jest.fn();
  const mockCreateSignedUrl = jest.fn();
  const mockFrom = jest.fn(() => ({ upload: mockUpload, createSignedUrl: mockCreateSignedUrl }));
  return { createClient: jest.fn(() => ({ storage: { from: mockFrom } })) };
});

import { createClient } from "@supabase/supabase-js";
import {
  assertFileSignature,
  CHECKLIST_BUCKET,
  GENERATED_DOCUMENTS_BUCKET,
  InvalidFileError,
  getSignedUrl,
  uploadFile,
  uploadPdfBuffer,
  validateUpload,
} from "@/lib/storage";

// storage.ts already called createClient() once at import time (its
// module-level singleton) — reuse that same call's mocks rather than
// creating a second, disconnected set.
const mockedCreateClient = createClient as jest.Mock;
const supabaseInstance = mockedCreateClient.mock.results[0].value;
const mockFrom = supabaseInstance.storage.from as jest.Mock;
const { upload: mockUpload, createSignedUrl: mockCreateSignedUrl } = mockFrom();

function makeFile(sizeBytes: number, type: string) {
  return new File([new Uint8Array(sizeBytes)], "file", { type });
}

beforeEach(() => {
  mockUpload.mockReset();
  mockCreateSignedUrl.mockReset();
  mockFrom.mockClear();
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

  it("names 'unknown' in the error when the file carries no mime type at all", () => {
    expect(() => validateUpload(makeFile(1024, ""))).toThrow(/unknown/);
  });

  it("rejects a PDF over the 5MB cap", () => {
    expect(() => validateUpload(makeFile(5 * 1024 * 1024 + 1, "application/pdf"))).toThrow(
      InvalidFileError
    );
  });

  it("rejects an image over the 2MB cap, using the smaller image limit not the PDF limit", () => {
    expect(() => validateUpload(makeFile(2 * 1024 * 1024 + 1, "image/png"))).toThrow(/2MB limit/);
  });
});

describe("uploadFile", () => {
  it("validates before ever touching Storage", async () => {
    await expect(
      uploadFile(CHECKLIST_BUCKET, "path.zip", makeFile(10, "application/zip"))
    ).rejects.toThrow(InvalidFileError);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("uploads with upsert:true and the file's content type, returning the path", async () => {
    mockUpload.mockResolvedValue({ data: { path: "profile-1/x.pdf" }, error: null });

    const result = await uploadFile(
      CHECKLIST_BUCKET,
      "profile-1/x.pdf",
      makeFile(10, "application/pdf")
    );

    expect(result).toBe("profile-1/x.pdf");
    expect(mockFrom).toHaveBeenCalledWith(CHECKLIST_BUCKET);
    expect(mockUpload).toHaveBeenCalledWith(
      "profile-1/x.pdf",
      expect.anything(),
      expect.objectContaining({ upsert: true, contentType: "application/pdf" })
    );
  });

  it("wraps a Storage error as InvalidFileError", async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: "bucket not found" } });

    await expect(
      uploadFile(CHECKLIST_BUCKET, "profile-1/x.pdf", makeFile(10, "application/pdf"))
    ).rejects.toThrow(/bucket not found/);
  });
});

describe("getSignedUrl", () => {
  it("returns the signed URL on success", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/x" },
      error: null,
    });

    const url = await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf");

    expect(url).toBe("https://signed.example/x");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("profile-1/x.pdf", 300);
  });

  it("respects a custom expiry", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/x" },
      error: null,
    });

    await getSignedUrl(CHECKLIST_BUCKET, "profile-1/x.pdf", 60);

    expect(mockCreateSignedUrl).toHaveBeenCalledWith("profile-1/x.pdf", 60);
  });

  it("throws InvalidFileError when Storage returns an error", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: "not found" } });

    await expect(getSignedUrl(CHECKLIST_BUCKET, "missing.pdf")).rejects.toThrow(/not found/);
  });

  it("throws InvalidFileError when Storage returns no data and no error", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: null });

    await expect(getSignedUrl(CHECKLIST_BUCKET, "missing.pdf")).rejects.toThrow(InvalidFileError);
  });
});

describe("uploadPdfBuffer", () => {
  it("uploads a PDF buffer with upsert and the PDF content type", async () => {
    mockUpload.mockResolvedValue({ error: null });
    const pdf = Buffer.from("%PDF-1.4 test");

    const path = await uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, "weekly/p1/wr1.pdf", pdf);

    expect(path).toBe("weekly/p1/wr1.pdf");
    expect(mockFrom).toHaveBeenCalledWith("generated-documents");
    expect(mockUpload).toHaveBeenCalledWith("weekly/p1/wr1.pdf", pdf, {
      upsert: true,
      contentType: "application/pdf",
    });
  });

  it("rejects a buffer over the 5MB PDF cap without calling Storage", async () => {
    const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, "x.pdf", tooBig)).rejects.toThrow(
      InvalidFileError
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("surfaces a Storage error as InvalidFileError", async () => {
    mockUpload.mockResolvedValue({ error: { message: "bucket not found" } });
    await expect(
      uploadPdfBuffer(GENERATED_DOCUMENTS_BUCKET, "x.pdf", Buffer.from("%PDF"))
    ).rejects.toThrow("bucket not found");
  });
});

// The browser-declared MIME type is attacker-controlled; the leading bytes
// must match it (secure-code-guardian: never trust input as declared).
describe("assertFileSignature", () => {
  const fileOf = (bytes: number[], type: string) =>
    new File([new Uint8Array(bytes)], "upload", { type });

  it("accepts real PDF, PNG and JPEG signatures", async () => {
    await expect(
      assertFileSignature(fileOf([0x25, 0x50, 0x44, 0x46, 0x2d], "application/pdf"))
    ).resolves.toBeUndefined();
    await expect(
      assertFileSignature(fileOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"))
    ).resolves.toBeUndefined();
    await expect(
      assertFileSignature(fileOf([0xff, 0xd8, 0xff, 0xe0], "image/jpeg"))
    ).resolves.toBeUndefined();
  });

  it("rejects an HTML file declared as an image", async () => {
    const html = Array.from("<html><script>", (c) => c.charCodeAt(0));
    await expect(assertFileSignature(fileOf(html, "image/png"))).rejects.toThrow(InvalidFileError);
  });

  it("rejects a PNG declared as a PDF", async () => {
    await expect(
      assertFileSignature(
        fileOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "application/pdf")
      )
    ).rejects.toThrow(InvalidFileError);
  });
});
