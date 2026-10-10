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
  CHECKLIST_BUCKET,
  InvalidFileError,
  getSignedUrl,
  uploadFile,
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
